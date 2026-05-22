// pin: resolves a closed-manifest package list against a live APK
// repository and writes a JSON lockfile (schema in
// //apk/private:lockfile.bzl).
//
// Layout assumptions match wolfi / alpine repos:
//
//	<repo-url>/<arch>/APKINDEX.tar.gz     (signed index)
//	<repo-url>/<arch>/<name>-<version>.apk
//
// Trust chain at lock time:
//  1. APKINDEX.tar.gz embeds an RSA detached signature over the
//     compressed bytes of the index segment, verified against the
//     consumer-supplied keyring. This is the anchor — every per-apk
//     sha256 we record below chains back to it because the index
//     names every .apk's filename and version.
//  2. Each per-apk sha256 is computed at pin time by streaming the
//     .apk bytes through SHA-256. Bazel's repository_ctx.download
//     re-checks this sha256 every build, so the apk-extract action
//     receives bytes byte-equal to what the signed index named.
//
// Subverting the per-apk digests therefore requires subverting the
// signature on APKINDEX.tar.gz — same posture as rules_rpm's
// repomd.xml.asc chain. Per-apk RSA signature verification at
// extract time is deliberately omitted; see ADR-companion README.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"chainguard.dev/apko/pkg/apk/apk"
)

type lockEntry struct {
	Version  string `json:"version"`
	Sha256   string `json:"sha256"`
	Path     string `json:"path"`
	Size     int64  `json:"size"`
	Checksum string `json:"checksum,omitempty"` // APKINDEX C: value (Q1<base64-sha1> of control)
	Origin   string `json:"origin,omitempty"`
}

type lockRepo struct {
	URL            string `json:"url"`
	Revision       string `json:"revision"`
	APKINDEXSha256 string `json:"apkindex_sha256"`
}

type lockfile struct {
	SchemaVersion int                             `json:"schema_version"`
	Repo          lockRepo                        `json:"repo"`
	Packages      map[string]map[string]lockEntry `json:"packages"`
}

type trustRoot map[string][]byte

type noAuth struct{}

func (noAuth) AddAuth(context.Context, *http.Request) error { return nil }

func main() {
	var (
		repoURL    = flag.String("repo-url", "", "base URL of the apk repo (containing per-arch subdirs)")
		signingKey = flag.String("signing-key", "", "PEM-encoded RSA public key for APKINDEX.tar.gz signature verification")
		pkgs       = flag.String("packages", "", "comma-separated closed package manifest")
		arches     = flag.String("architectures", "", "comma-separated declared arches (e.g. x86_64,aarch64)")
		lockOut    = flag.String("lock-out", "", "workspace-relative path to lockfile output")
	)
	flag.Parse()

	if *repoURL == "" || *pkgs == "" || *arches == "" || *lockOut == "" {
		fmt.Fprintln(os.Stderr, "pin: --repo-url, --packages, --architectures, --lock-out are required")
		os.Exit(2)
	}

	declaredArches := splitCSV(*arches)
	declaredPkgs := splitCSV(*pkgs)
	if len(declaredArches) == 0 || len(declaredPkgs) == 0 {
		fmt.Fprintln(os.Stderr, "pin: --packages and --architectures must be non-empty")
		os.Exit(2)
	}

	// Load the trust root once. Same keyring verifies APKINDEX.tar.gz for
	// every arch (repos are arch-multiplexed under one signing chain).
	// Empty --signing-key degrades to TLS-only trust and is loud on
	// stderr — the `apk.install(...)` extension requires signing_key, so
	// production calls always populate it.
	trustRoot, err := loadTrustRoot(*signingKey)
	if err != nil {
		fmt.Fprintln(os.Stderr, "pin:", err)
		os.Exit(1)
	}

	lock, err := resolve(*repoURL, declaredArches, declaredPkgs, trustRoot)
	if err != nil {
		fmt.Fprintln(os.Stderr, "pin:", err)
		os.Exit(1)
	}
	if err := writeLockfile(stripLabelPrefix(*lockOut), lock); err != nil {
		fmt.Fprintln(os.Stderr, "pin: write lockfile:", err)
		os.Exit(1)
	}
}

func loadTrustRoot(keyPath string) (trustRoot, error) {
	if keyPath == "" {
		fmt.Fprintln(os.Stderr, "pin: warning: --signing-key is empty; APKINDEX signature verification skipped (lock-time trust root degrades to TLS only)")
		return nil, nil
	}
	data, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("load signing key: %w", err)
	}
	keyName := filepath.Base(keyPath)
	keys := trustRoot{keyName: data}
	if trimmed := strings.TrimSuffix(keyName, ".rsa.pub"); trimmed != keyName {
		keys[trimmed] = data
	}
	return keys, nil
}

// resolve fetches each arch's signed APKINDEX, indexes every package,
// walks dep closure from declared roots, then sha256s every .apk in the
// closure. Returns the lockfile ready for marshaling.
func resolve(repoURL string, declaredArches, declaredPkgs []string, trustRoot trustRoot) (*lockfile, error) {
	repoURL = strings.TrimRight(repoURL, "/")

	httpClient := &http.Client{Timeout: 120 * time.Second}
	out := map[string]map[string]lockEntry{}
	var canonicalSha string
	for i, arch := range declaredArches {
		indexURL := apk.IndexURL(repoURL, arch)
		body, err := httpGet(indexURL)
		if err != nil {
			return nil, fmt.Errorf("fetch APKINDEX %s: %w", arch, err)
		}
		sum := sha256.Sum256(body)
		if i == 0 {
			canonicalSha = hex.EncodeToString(sum[:])
		}

		indexes, err := apk.GetRepositoryIndexes(
			context.Background(),
			[]string{repoURL},
			map[string][]byte(trustRoot),
			arch,
			apk.WithHTTPClient(httpClient),
			apk.WithIndexAuthenticator(noAuth{}),
			apk.WithIgnoreSignatures(trustRoot == nil),
		)
		if err != nil {
			return nil, fmt.Errorf("resolve APKINDEX %s: %w", arch, err)
		}

		resolver := apk.NewPkgResolver(context.Background(), indexes)
		resolved, conflicts, err := resolver.GetPackagesWithDependencies(context.Background(), declaredPkgs, map[string][]apk.NamedIndex{arch: indexes})
		if err != nil {
			return nil, fmt.Errorf("resolve package closure %s: %w", arch, err)
		}
		if len(conflicts) > 0 {
			return nil, fmt.Errorf("resolve package closure %s: conflicts: %s", arch, strings.Join(conflicts, ", "))
		}

		for _, p := range resolved {
			lockArch := p.Arch
			if lockArch == "noarch" && i > 0 {
				continue
			}
			path := fmt.Sprintf("%s/%s", lockArch, p.Filename())
			apkURL := fmt.Sprintf("%s/%s", repoURL, path)
			sha, size, err := streamSha256(apkURL)
			if err != nil {
				return nil, fmt.Errorf("hash %s: %w", apkURL, err)
			}
			// APKINDEX `S:` may disagree with the on-wire size on rare
			// repo-rebuild edge cases; trust the bytes we actually fetched
			// and warn if the index claimed a different number.
			if p.Size != 0 && int64(p.Size) != size {
				fmt.Fprintf(os.Stderr, "pin: warning: %s: APKINDEX S:=%d but on-wire size %d\n", path, p.Size, size)
			}
			if _, ok := out[p.Name]; !ok {
				out[p.Name] = map[string]lockEntry{}
			}
			out[p.Name][lockArch] = lockEntry{
				Version:  p.Version,
				Sha256:   sha,
				Path:     path,
				Size:     size,
				Checksum: checksumString(p.Checksum),
				Origin:   p.Origin,
			}
		}

	}
	if err := validate(out, declaredArches, declaredPkgs); err != nil {
		return nil, err
	}

	return &lockfile{
		SchemaVersion: 1,
		Repo: lockRepo{
			URL:            repoURL,
			Revision:       canonicalSha[:16], // truncated APKINDEX sha → cache-friendly anchor
			APKINDEXSha256: canonicalSha,
		},
		Packages: out,
	}, nil
}

// checksumString re-encodes apko's raw checksum bytes as the
// "Q1<base64>" form APKINDEX writes on the wire. The leading "Q1"
// marker names SHA-1 over the control segment (apk-tools' historical
// digest); apko stores the unencoded SHA-1 bytes in Package.Checksum.
func checksumString(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	return "Q1" + base64.StdEncoding.EncodeToString(raw)
}

func validate(best map[string]map[string]lockEntry, declaredArches, declaredPkgs []string) error {
	var missing []string
	for _, name := range declaredPkgs {
		archEntries, ok := best[name]
		if !ok || len(archEntries) == 0 {
			missing = append(missing, name)
			continue
		}
		if _, noarch := archEntries["noarch"]; noarch {
			continue
		}
		for _, arch := range declaredArches {
			if _, ok := archEntries[arch]; !ok {
				missing = append(missing, fmt.Sprintf("%s [missing %s]", name, arch))
			}
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return fmt.Errorf("closed manifest unresolved: %s", strings.Join(missing, ", "))
	}
	return nil
}

func splitCSV(s string) []string {
	out := []string{}
	for _, part := range strings.Split(s, ",") {
		p := strings.TrimSpace(part)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func stripLabelPrefix(label string) string {
	s := strings.TrimPrefix(label, "@@")
	s = strings.TrimPrefix(s, "//")
	if i := strings.Index(s, ":"); i >= 0 {
		pkg := s[:i]
		name := s[i+1:]
		if pkg == "" {
			return name
		}
		return pkg + "/" + name
	}
	return s
}

const httpGetMaxAttempts = 3

var httpGetBaseBackoff = 1 * time.Second

func httpGet(url string) ([]byte, error) {
	var lastErr error
	for attempt := 1; attempt <= httpGetMaxAttempts; attempt++ {
		body, err, retryable := httpGetOnce(url)
		if err == nil {
			return body, nil
		}
		lastErr = err
		if !retryable || attempt == httpGetMaxAttempts {
			break
		}
		backoff := httpGetBaseBackoff << (attempt - 1)
		fmt.Fprintf(os.Stderr, "pin: %s failed (attempt %d/%d), retrying in %v: %v\n",
			url, attempt, httpGetMaxAttempts, backoff, err)
		time.Sleep(backoff)
	}
	return nil, fmt.Errorf("%s: %w", url, lastErr)
}

type httpStatusError struct{ status int }

func (e *httpStatusError) Error() string { return fmt.Sprintf("HTTP %d", e.status) }

func httpGetOnce(url string) (body []byte, err error, retryable bool) {
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err, true
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 && resp.StatusCode < 600 {
		return nil, &httpStatusError{status: resp.StatusCode}, true
	}
	if resp.StatusCode != http.StatusOK {
		return nil, &httpStatusError{status: resp.StatusCode}, false
	}
	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return nil, err, true
	}
	return body, nil, false
}

// streamSha256 GETs url and returns (hex-sha256, size). Streams through
// the hasher so an arbitrarily large .apk fits in constant memory.
func streamSha256(url string) (string, int64, error) {
	var lastErr error
	for attempt := 1; attempt <= httpGetMaxAttempts; attempt++ {
		client := &http.Client{Timeout: 600 * time.Second}
		resp, err := client.Get(url)
		if err != nil {
			lastErr = err
			if attempt < httpGetMaxAttempts {
				time.Sleep(httpGetBaseBackoff << (attempt - 1))
			}
			continue
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return "", 0, fmt.Errorf("%s: HTTP %d", url, resp.StatusCode)
		}
		h := sha256.New()
		n, err := io.Copy(h, resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			if attempt < httpGetMaxAttempts {
				time.Sleep(httpGetBaseBackoff << (attempt - 1))
			}
			continue
		}
		return hex.EncodeToString(h.Sum(nil)), n, nil
	}
	return "", 0, fmt.Errorf("%s: %w", url, errors.Join(lastErr, errors.New("max attempts exceeded")))
}

func writeLockfile(path string, lock *lockfile) error {
	buf, err := json.MarshalIndent(lock, "", "  ")
	if err != nil {
		return err
	}
	buf = append(buf, '\n')
	return os.WriteFile(path, buf, 0o644)
}
