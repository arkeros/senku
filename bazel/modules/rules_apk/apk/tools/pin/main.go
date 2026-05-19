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
	"archive/tar"
	"bytes"
	"crypto/rsa"
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
	"sort"
	"strings"
	"time"

	"chainguard.dev/apko/pkg/apk/apk"
	"github.com/arkeros/senku/bazel/modules/rules_apk/apk/tools/internal/apkformat"
	"github.com/arkeros/senku/bazel/modules/rules_apk/apk/tools/internal/apkkey"
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

func loadTrustRoot(keyPath string) ([]*rsa.PublicKey, error) {
	if keyPath == "" {
		fmt.Fprintln(os.Stderr, "pin: warning: --signing-key is empty; APKINDEX signature verification skipped (lock-time trust root degrades to TLS only)")
		return nil, nil
	}
	keys, err := apkkey.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("load signing key: %w", err)
	}
	return keys, nil
}

type pkgKey struct {
	name string
	arch string
}

type candidate struct {
	version  string
	checksum string // Q1<base64-sha1> from APKINDEX C:
	size     int64
	origin   string
	depends  []string
	provides []string
}

// resolve fetches each arch's signed APKINDEX, indexes every package,
// walks dep closure from declared roots, then sha256s every .apk in the
// closure. Returns the lockfile ready for marshaling.
func resolve(repoURL string, declaredArches, declaredPkgs []string, trustRoot []*rsa.PublicKey) (*lockfile, error) {
	repoURL = strings.TrimRight(repoURL, "/")

	candidates := map[pkgKey]candidate{}
	bestVersion := map[pkgKey]string{}

	var canonicalSha string
	for i, arch := range declaredArches {
		indexURL := fmt.Sprintf("%s/%s/APKINDEX.tar.gz", repoURL, arch)
		body, err := httpGet(indexURL)
		if err != nil {
			return nil, fmt.Errorf("fetch APKINDEX %s: %w", arch, err)
		}
		sum := sha256.Sum256(body)
		if i == 0 {
			canonicalSha = hex.EncodeToString(sum[:])
		}

		indexBytes, err := apkformat.VerifyAPKINDEX(body, trustRoot)
		if err != nil {
			return nil, fmt.Errorf("verify APKINDEX %s: %w", arch, err)
		}
		packages, err := parseIndexFromTar(indexBytes)
		if err != nil {
			return nil, fmt.Errorf("parse APKINDEX %s: %w", arch, err)
		}

		for _, p := range packages {
			// Drop entries for the wrong arch: an APKINDEX carries
			// every package available from that mirror.
			if p.Arch != arch && p.Arch != "noarch" {
				continue
			}
			// Noarch entries appear identically in every arch's index;
			// commit on first pass, skip thereafter so the canonical
			// "path" prefix stays anchored.
			if p.Arch == "noarch" && i > 0 {
				continue
			}
			key := pkgKey{name: p.Name, arch: p.Arch}
			if cur, ok := bestVersion[key]; ok {
				curV, err1 := apk.ParseVersion(cur)
				newV, err2 := apk.ParseVersion(p.Version)
				// If either parse fails, fall through to take the
				// new version — APKINDEX may carry a non-conformant
				// version string and the resolver shouldn't silently
				// stick on the first one seen.
				if err1 == nil && err2 == nil && apk.CompareVersions(newV, curV) <= 0 {
					continue
				}
			}
			bestVersion[key] = p.Version
			candidates[key] = candidate{
				version:  p.Version,
				// apko's Package.Checksum is the raw bytes of the
				// sha1 over the control segment; emit it in the
				// canonical Q1<base64> form for the lockfile.
				checksum: checksumString(p.Checksum),
				size:     int64(p.Size),
				origin:   p.Origin,
				depends:  p.Dependencies,
				provides: p.Provides,
			}
		}
	}

	// Provides index: capability name → keys offering it. Every candidate
	// implicitly provides itself by package name.
	providesIndex := map[string][]pkgKey{}
	for key, c := range candidates {
		providesIndex[key.name] = append(providesIndex[key.name], key)
		for _, p := range c.provides {
			// `provides` tokens may have version constraints; strip to bare name.
			bare := stripVersionConstraint(p)
			if bare != "" {
				providesIndex[bare] = append(providesIndex[bare], key)
			}
		}
	}

	closure, err := closeDeps(candidates, providesIndex, declaredArches, declaredPkgs)
	if err != nil {
		return nil, err
	}

	// Fan out per-apk sha256 hashing. Sequential for predictability; pin
	// runs daily so the wall-clock budget is generous.
	out := map[string]map[string]lockEntry{}
	for key := range closure {
		c := candidates[key]
		filename := fmt.Sprintf("%s-%s.apk", key.name, c.version)
		path := fmt.Sprintf("%s/%s", key.arch, filename)
		apkURL := fmt.Sprintf("%s/%s", repoURL, path)
		sha, size, err := streamSha256(apkURL)
		if err != nil {
			return nil, fmt.Errorf("hash %s: %w", apkURL, err)
		}
		// APKINDEX `S:` may disagree with the on-wire size on rare
		// repo-rebuild edge cases; trust the bytes we actually fetched
		// and warn if the index claimed a different number.
		if c.size != 0 && c.size != size {
			fmt.Fprintf(os.Stderr, "pin: warning: %s: APKINDEX S:=%d but on-wire size %d\n", path, c.size, size)
		}
		if _, ok := out[key.name]; !ok {
			out[key.name] = map[string]lockEntry{}
		}
		out[key.name][key.arch] = lockEntry{
			Version:  c.version,
			Sha256:   sha,
			Path:     path,
			Size:     size,
			Checksum: c.checksum,
			Origin:   c.origin,
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

func closeDeps(candidates map[pkgKey]candidate, providesIndex map[string][]pkgKey, declaredArches, declaredPkgs []string) (map[pkgKey]bool, error) {
	closure := map[pkgKey]bool{}
	for _, arch := range declaredArches {
		var worklist []pkgKey
		for _, name := range declaredPkgs {
			if _, ok := candidates[pkgKey{name, arch}]; ok {
				worklist = append(worklist, pkgKey{name, arch})
				continue
			}
			if _, ok := candidates[pkgKey{name, "noarch"}]; ok {
				worklist = append(worklist, pkgKey{name, "noarch"})
				continue
			}
			return nil, fmt.Errorf("declared package %q not found in repo for arch %s", name, arch)
		}
		for len(worklist) > 0 {
			cur := worklist[0]
			worklist = worklist[1:]
			if closure[cur] {
				continue
			}
			closure[cur] = true
			c := candidates[cur]
			for _, req := range c.depends {
				bare := normalizeDep(req)
				if bare == "" {
					continue
				}
				chosen, ok := pickProvider(bare, providesIndex[bare], arch)
				if !ok {
					fmt.Fprintf(os.Stderr, "pin: warning: no provider for %q (required by %s.%s)\n", req, cur.name, cur.arch)
					continue
				}
				worklist = append(worklist, chosen)
			}
		}
	}
	return closure, nil
}

// normalizeDep maps an APKINDEX `D:` token to the bare capability
// name we look up in the provides index. apko's `ParsePackageIndex`
// returns D: tokens verbatim — version constraints (`name=ver`,
// `name>=ver`, …), the conflict marker (`!name`), and operator
// suffixes leak through unchanged.
//
// Longest operators are matched first so `name>=2` resolves to `name`,
// not `name>` (left-to-right scan would hit `=` inside `>=` first).
// Conflict markers (`!name`) collapse to empty so the closure walker
// skips them; they're "must not be present" assertions, not edges
// to walk.
func normalizeDep(tok string) string {
	if tok == "" || strings.HasPrefix(tok, "!") {
		return ""
	}
	for _, sep := range []string{">=", "<=", "~=", "=", ">", "<", "~"} {
		if i := strings.Index(tok, sep); i >= 0 {
			return tok[:i]
		}
	}
	return tok
}

// parseIndexFromTar walks the (already gunzipped) index tar bytes,
// locates the APKINDEX entry, and feeds it to apko's canonical parser.
// apko's IndexFromArchive expects the full .tar.gz; after signature
// verification we already have the uncompressed tar bytes, so the
// gzip step would be wasted work. ParsePackageIndex is the inner
// helper that takes the raw APKINDEX text.
func parseIndexFromTar(indexTar []byte) ([]*apk.Package, error) {
	tr := tar.NewReader(bytes.NewReader(indexTar))
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil, errors.New("APKINDEX file not found in index tar")
		}
		if err != nil {
			return nil, fmt.Errorf("read index tar: %w", err)
		}
		if hdr.Name == "APKINDEX" {
			return apk.ParsePackageIndex(io.NopCloser(tr))
		}
	}
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

// pickProvider chooses one (name, arch) candidate to satisfy the
// requested capability. Selection priority:
//
//  1. Package whose name *equals* the capability (e.g. for `nginx-config`,
//     prefer the package named `nginx-config` over alphabetically-earlier
//     virtual providers like `apicurio-registry-nginx-config`).
//  2. Compatible arch (target arch wins over noarch when both exist).
//  3. Shorter name (less likely to be a niche virtual provider).
//  4. Lexically first (final tiebreaker for determinism).
//
// Without #1, wolfi virtual capabilities like `nginx-config` resolve
// to whichever vendor-prefixed package happens to come first by name
// — pulling in entire app bundles as transitive closure for a config
// stub. Same problem with `cmd:node`, which dozens of packages may
// provide while one nodejs runtime is the obvious answer.
func pickProvider(capability string, providers []pkgKey, targetArch string) (pkgKey, bool) {
	var compatible []pkgKey
	for _, p := range providers {
		if p.arch == targetArch || p.arch == "noarch" {
			compatible = append(compatible, p)
		}
	}
	if len(compatible) == 0 {
		return pkgKey{}, false
	}
	sort.Slice(compatible, func(i, j int) bool {
		iExact := compatible[i].name == capability
		jExact := compatible[j].name == capability
		if iExact != jExact {
			return iExact
		}
		iArch := compatible[i].arch == targetArch
		jArch := compatible[j].arch == targetArch
		if iArch != jArch {
			return iArch
		}
		if len(compatible[i].name) != len(compatible[j].name) {
			return len(compatible[i].name) < len(compatible[j].name)
		}
		return compatible[i].name < compatible[j].name
	})
	return compatible[0], true
}

// stripVersionConstraint trims "name=1.0", "name>=2", "name~3.0" to bare "name".
func stripVersionConstraint(tok string) string {
	for _, sep := range []string{"=", ">=", "<=", ">", "<", "~"} {
		if i := strings.Index(tok, sep); i >= 0 {
			return tok[:i]
		}
	}
	return tok
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
