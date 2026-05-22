package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeRepo synthesizes an in-process APK repo:
//   /<arch>/APKINDEX.tar.gz   (signed)
//   /<arch>/<name>-<version>.apk   (returns body matching its sha256 declared in our internal map)
type fakeRepo struct {
	signingKey *rsa.PrivateKey
	indexes    map[string][]byte         // arch → APKINDEX.tar.gz bytes
	apkBodies  map[string][]byte         // "arch/name-version.apk" → bytes
	mu         struct{ requests []string }
}

func sigTar(t *testing.T, filename string, body []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	if err := tw.WriteHeader(&tar.Header{Name: filename, Mode: 0o644, Size: int64(len(body))}); err != nil {
		t.Fatalf("tar header: %v", err)
	}
	if _, err := tw.Write(body); err != nil {
		t.Fatalf("tar write: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	return buf.Bytes()
}

func indexTar(t *testing.T, indexBody []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	if err := tw.WriteHeader(&tar.Header{Name: "APKINDEX", Mode: 0o644, Size: int64(len(indexBody))}); err != nil {
		t.Fatalf("tar header: %v", err)
	}
	if _, err := tw.Write(indexBody); err != nil {
		t.Fatalf("tar write: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	return buf.Bytes()
}

func gzipBytes(t *testing.T, payload []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(payload); err != nil {
		t.Fatalf("gz write: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gz close: %v", err)
	}
	return buf.Bytes()
}

func signedAPKINDEX(t *testing.T, key *rsa.PrivateKey, indexBody []byte) []byte {
	t.Helper()
	gzIndex := gzipBytes(t, indexTar(t, indexBody))
	h := sha256.New()
	h.Write(gzIndex)
	digest := h.Sum(nil)
	sigBytes, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest)
	if err != nil {
		t.Fatalf("SignPKCS1v15: %v", err)
	}
	sigBody := sigTar(t, ".SIGN.RSA256.test.rsa.pub", sigBytes)
	// apk-tools/apko signed indexes concatenate the signature tar with the
	// index tar. The signature tar stream does not include final zero
	// blocks, so a tar reader can continue into the APKINDEX archive.
	if len(sigBody) < 1024 {
		t.Fatalf("signature tar unexpectedly short: %d bytes", len(sigBody))
	}
	sigBody = sigBody[:len(sigBody)-1024]
	gzSig := gzipBytes(t, sigBody)
	return append(gzSig, gzIndex...)
}

func writePubKeyPEM(t *testing.T, key *rsa.PrivateKey) string {
	t.Helper()
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatalf("MarshalPKIXPublicKey: %v", err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	path := filepath.Join(t.TempDir(), "test.rsa.pub")
	if err := os.WriteFile(path, pemBytes, 0o644); err != nil {
		t.Fatalf("write key: %v", err)
	}
	return path
}

func TestResolve_HappyPath(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	// Synthesize one apk + APKINDEX listing it.
	apkBody := []byte("fake-apk-bytes-for-tzdata")
	h := sha256.New()
	h.Write(apkBody)
	wantSha := hex.EncodeToString(h.Sum(nil))

	indexBody := []byte("" +
		"C:Q15T0AzgrFvAyVCvw2qpHb/Y2DTYY=\n" +
		"P:tzdata\n" +
		"V:2026a-r0\n" +
		"A:noarch\n" +
		"S:" + fmt.Sprintf("%d", len(apkBody)) + "\n" +
		"o:tzdata\n" +
		"\n")

	apkindex := signedAPKINDEX(t, key, indexBody)

	mux := http.NewServeMux()
	mux.HandleFunc("/x86_64/APKINDEX.tar.gz", func(w http.ResponseWriter, r *http.Request) {
		w.Write(apkindex)
	})
	mux.HandleFunc("/aarch64/APKINDEX.tar.gz", func(w http.ResponseWriter, r *http.Request) {
		w.Write(apkindex)
	})
	// tzdata is noarch in the fixture → path is noarch/...apk, not per-arch.
	mux.HandleFunc("/noarch/tzdata-2026a-r0.apk", func(w http.ResponseWriter, r *http.Request) {
		w.Write(apkBody)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	keyPath := writePubKeyPEM(t, key)
	trustRoot, err := loadTrustRoot(keyPath)
	if err != nil {
		t.Fatalf("loadTrustRoot: %v", err)
	}

	lock, err := resolve(srv.URL, []string{"x86_64", "aarch64"}, []string{"tzdata"}, trustRoot)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	tz, ok := lock.Packages["tzdata"]
	if !ok {
		t.Fatalf("lockfile missing tzdata: %+v", lock.Packages)
	}
	entry, ok := tz["noarch"]
	if !ok {
		t.Fatalf("tzdata missing noarch: %+v", tz)
	}
	if entry.Sha256 != wantSha {
		t.Errorf("Sha256 = %s, want %s", entry.Sha256, wantSha)
	}
	if entry.Version != "2026a-r0" {
		t.Errorf("Version = %s", entry.Version)
	}
	if entry.Path != "noarch/tzdata-2026a-r0.apk" {
		t.Errorf("Path = %s", entry.Path)
	}
	if entry.Checksum != "Q15T0AzgrFvAyVCvw2qpHb/Y2DTYY=" {
		t.Errorf("Checksum = %q", entry.Checksum)
	}
}

func TestResolve_ClosedManifestUnresolved(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	apkindex := signedAPKINDEX(t, key, []byte("P:other\nV:1-r0\nA:x86_64\n\n"))

	mux := http.NewServeMux()
	mux.HandleFunc("/x86_64/APKINDEX.tar.gz", func(w http.ResponseWriter, r *http.Request) {
		w.Write(apkindex)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	keyPath := writePubKeyPEM(t, key)
	trustRoot, _ := loadTrustRoot(keyPath)

	_, err := resolve(srv.URL, []string{"x86_64"}, []string{"missing-pkg"}, trustRoot)
	if err == nil {
		t.Fatal("expected closed-manifest error, got nil")
	}
	if !strings.Contains(err.Error(), "missing-pkg") {
		t.Errorf("err = %v, want it to name the missing package", err)
	}
}

func TestResolve_WrongKeyFails(t *testing.T) {
	signingKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	wrongKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	apkindex := signedAPKINDEX(t, signingKey, []byte("P:foo\nV:1-r0\nA:x86_64\n\n"))

	mux := http.NewServeMux()
	mux.HandleFunc("/x86_64/APKINDEX.tar.gz", func(w http.ResponseWriter, r *http.Request) {
		w.Write(apkindex)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	keyPath := writePubKeyPEM(t, wrongKey)
	trustRoot, _ := loadTrustRoot(keyPath)

	_, err := resolve(srv.URL, []string{"x86_64"}, []string{"foo"}, trustRoot)
	if err == nil {
		t.Fatal("expected verification error, got nil")
	}
}

func TestResolve_ConflictingRootPackagesFail(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	indexBody := []byte("" +
		"P:app\n" +
		"V:1-r0\n" +
		"A:x86_64\n" +
		"D:!bad\n" +
		"\n" +
		"P:bad\n" +
		"V:1-r0\n" +
		"A:x86_64\n" +
		"\n")
	apkindex := signedAPKINDEX(t, key, indexBody)

	mux := http.NewServeMux()
	mux.HandleFunc("/x86_64/APKINDEX.tar.gz", func(w http.ResponseWriter, r *http.Request) {
		w.Write(apkindex)
	})
	mux.HandleFunc("/x86_64/app-1-r0.apk", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("app"))
	})
	mux.HandleFunc("/x86_64/bad-1-r0.apk", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("bad"))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	keyPath := writePubKeyPEM(t, key)
	trustRoot, _ := loadTrustRoot(keyPath)

	_, err := resolve(srv.URL, []string{"x86_64"}, []string{"app", "bad"}, trustRoot)
	if err == nil {
		t.Fatal("expected package conflict error, got nil")
	}
	if !strings.Contains(err.Error(), "bad") {
		t.Errorf("err = %v, want it to name the conflicting package", err)
	}
}

func TestStripLabelPrefix(t *testing.T) {
	cases := map[string]string{
		"//:wolfi.lock.json":       "wolfi.lock.json",
		"//foo:bar.json":           "foo/bar.json",
		"@@//:wolfi.lock.json":     "wolfi.lock.json",
		"@@//foo/bar:baz.json":     "foo/bar/baz.json",
		"path/to/file.json":        "path/to/file.json",
	}
	for in, want := range cases {
		got := stripLabelPrefix(in)
		if got != want {
			t.Errorf("stripLabelPrefix(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestWriteLockfile_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "wolfi.lock.json")
	lock := &lockfile{
		SchemaVersion: 1,
		Repo: lockRepo{
			URL:            "https://example.test",
			Revision:       "0123456789abcdef",
			APKINDEXSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		},
		Packages: map[string]map[string]lockEntry{
			"tzdata": {
				"noarch": {
					Version:  "2026a-r0",
					Sha256:   "deadbeef",
					Path:     "noarch/tzdata-2026a-r0.apk",
					Size:     42,
					Checksum: "Q1xxxx=",
					Origin:   "tzdata",
				},
			},
		},
	}
	if err := writeLockfile(path, lock); err != nil {
		t.Fatalf("writeLockfile: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !bytes.HasSuffix(raw, []byte("\n")) {
		t.Error("lockfile must end with newline")
	}
	var got lockfile
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.SchemaVersion != 1 {
		t.Errorf("schema_version = %d", got.SchemaVersion)
	}
	if got.Packages["tzdata"]["noarch"].Sha256 != "deadbeef" {
		t.Errorf("round-trip lost sha256")
	}
}
