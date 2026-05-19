package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// makeApk synthesizes a minimal .apk: 3 concatenated gzip streams.
// stream 0: signature tar (just a .SIGN.RSA256.<key>.pub file w/ dummy bytes)
// stream 1: control tar containing .PKGINFO
// stream 2: data tar with the supplied files (path → content)
func makeApk(t *testing.T, pkginfo string, files map[string]string) []byte {
	t.Helper()

	tarBytes := func(name string, body []byte) []byte {
		var buf bytes.Buffer
		tw := tar.NewWriter(&buf)
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body)), Format: tar.FormatUSTAR}); err != nil {
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

	tarMulti := func(entries map[string]string) []byte {
		var buf bytes.Buffer
		tw := tar.NewWriter(&buf)
		// Stable iteration order for deterministic test bytes.
		var names []string
		for n := range entries {
			names = append(names, n)
		}
		// sort.Strings would be cleaner; do a simple two-loop sort to keep deps light.
		for i := range names {
			for j := i + 1; j < len(names); j++ {
				if names[j] < names[i] {
					names[i], names[j] = names[j], names[i]
				}
			}
		}
		for _, name := range names {
			body := []byte(entries[name])
			if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body)), Format: tar.FormatUSTAR}); err != nil {
				t.Fatalf("tar header: %v", err)
			}
			if _, err := tw.Write(body); err != nil {
				t.Fatalf("tar write: %v", err)
			}
		}
		if err := tw.Close(); err != nil {
			t.Fatalf("tar close: %v", err)
		}
		return buf.Bytes()
	}

	gz := func(payload []byte) []byte {
		var buf bytes.Buffer
		w := gzip.NewWriter(&buf)
		if _, err := w.Write(payload); err != nil {
			t.Fatalf("gz write: %v", err)
		}
		if err := w.Close(); err != nil {
			t.Fatalf("gz close: %v", err)
		}
		return buf.Bytes()
	}

	sigTar := tarBytes(".SIGN.RSA256.wolfi-signing.rsa.pub", []byte("not-a-real-signature"))
	ctlTar := tarBytes(".PKGINFO", []byte(pkginfo))
	dataTar := tarMulti(files)

	return append(append(gz(sigTar), gz(ctlTar)...), gz(dataTar)...)
}

const testPKGINFO = `pkgname = tzdata
pkgver = 2026a-r0
arch = noarch
pkgdesc = Timezone data
size = 4194304
url = https://www.iana.org/time-zones
license = ICU
origin = tzdata
depend = ca-certificates-bundle
`

func TestExtract_HappyPath(t *testing.T) {
	dir := t.TempDir()
	apk := filepath.Join(dir, "tzdata.apk")
	contentOut := filepath.Join(dir, "content.tar")
	fragOut := filepath.Join(dir, "installed.fragment")

	body := makeApk(t, testPKGINFO, map[string]string{
		"usr/share/zoneinfo/UTC":    "fake-utc-bytes",
		"usr/share/zoneinfo/Europe/Madrid": "fake-madrid-bytes",
		// Allow-list filter should drop these:
		"usr/share/doc/tzdata/README": "should be dropped",
		"usr/share/man/man8/tzdata.8": "should be dropped",
	})
	if err := os.WriteFile(apk, body, 0o644); err != nil {
		t.Fatalf("write apk: %v", err)
	}

	if err := Extract(apk, contentOut, fragOut, "tzdata", "2026a-r0", "noarch"); err != nil {
		t.Fatalf("Extract: %v", err)
	}

	// Inspect content tar: zoneinfo entries present, doc/man absent.
	contentBytes, err := os.ReadFile(contentOut)
	if err != nil {
		t.Fatalf("read content: %v", err)
	}
	names := tarEntryNames(t, contentBytes)
	hasName := func(n string) bool {
		for _, x := range names {
			if x == n {
				return true
			}
		}
		return false
	}
	if !hasName("usr/share/zoneinfo/UTC") {
		t.Errorf("content tar missing UTC zoneinfo: %v", names)
	}
	for _, dropped := range []string{"usr/share/doc/tzdata/README", "usr/share/man/man8/tzdata.8"} {
		if hasName(dropped) {
			t.Errorf("content tar should not contain %q", dropped)
		}
	}

	// Inspect fragment. apk.PackageToInstalled emits the canonical
	// installed-db shape; C: is the SHA-1 of the actual control
	// segment (computed at extract time), so we only check it has
	// the right "Q1" prefix and base64 alphabet rather than a literal
	// value.
	frag, err := os.ReadFile(fragOut)
	if err != nil {
		t.Fatalf("read fragment: %v", err)
	}
	for _, want := range []string{
		"P:tzdata\n",
		"V:2026a-r0\n",
		"A:noarch\n",
		"o:tzdata\n",
	} {
		if !bytes.Contains(frag, []byte(want)) {
			t.Errorf("fragment missing %q\ngot:\n%s", want, frag)
		}
	}
	if !bytes.Contains(frag, []byte("C:Q1")) {
		t.Errorf("fragment missing canonical C:Q1<base64> checksum\ngot:\n%s", frag)
	}
}

func TestExtract_ValidatesPackageMetadata(t *testing.T) {
	dir := t.TempDir()
	apk := filepath.Join(dir, "tzdata.apk")
	body := makeApk(t, testPKGINFO, map[string]string{"usr/share/zoneinfo/UTC": "x"})
	if err := os.WriteFile(apk, body, 0o644); err != nil {
		t.Fatalf("write apk: %v", err)
	}

	cases := []struct {
		name, pkg, ver, arch, wantSub string
	}{
		{"pkg mismatch", "wrong", "2026a-r0", "noarch", "package mismatch"},
		{"ver mismatch", "tzdata", "1.0", "noarch", "version mismatch"},
		{"arch mismatch", "tzdata", "2026a-r0", "x86_64", "arch mismatch"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := Extract(apk, filepath.Join(dir, "out.tar"), filepath.Join(dir, "out.frag"), tc.pkg, tc.ver, tc.arch)
			if err == nil {
				t.Fatal("expected mismatch error, got nil")
			}
			if !strings.Contains(err.Error(), tc.wantSub) {
				t.Errorf("err = %v, want substring %q", err, tc.wantSub)
			}
		})
	}
}

// makeUnsignedApk synthesizes a wolfi/melange-style 2-stream .apk
// without the leading signature segment.
func makeUnsignedApk(t *testing.T, pkginfo string, files map[string]string) []byte {
	t.Helper()
	tarBytes := func(name string, body []byte) []byte {
		var buf bytes.Buffer
		tw := tar.NewWriter(&buf)
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body)), Format: tar.FormatUSTAR}); err != nil {
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
	tarMulti := func(entries map[string]string) []byte {
		var buf bytes.Buffer
		tw := tar.NewWriter(&buf)
		var names []string
		for n := range entries {
			names = append(names, n)
		}
		for i := range names {
			for j := i + 1; j < len(names); j++ {
				if names[j] < names[i] {
					names[i], names[j] = names[j], names[i]
				}
			}
		}
		for _, n := range names {
			body := []byte(entries[n])
			if err := tw.WriteHeader(&tar.Header{Name: n, Mode: 0o644, Size: int64(len(body)), Format: tar.FormatUSTAR}); err != nil {
				t.Fatalf("tar header: %v", err)
			}
			if _, err := tw.Write(body); err != nil {
				t.Fatalf("tar write: %v", err)
			}
		}
		if err := tw.Close(); err != nil {
			t.Fatalf("tar close: %v", err)
		}
		return buf.Bytes()
	}
	gz := func(payload []byte) []byte {
		var buf bytes.Buffer
		w := gzip.NewWriter(&buf)
		if _, err := w.Write(payload); err != nil {
			t.Fatalf("gz write: %v", err)
		}
		if err := w.Close(); err != nil {
			t.Fatalf("gz close: %v", err)
		}
		return buf.Bytes()
	}
	return append(gz(tarBytes(".PKGINFO", []byte(pkginfo))), gz(tarMulti(files))...)
}

func TestExtract_TwoStreamUnsignedApk(t *testing.T) {
	dir := t.TempDir()
	apk := filepath.Join(dir, "wolfi-style.apk")
	contentOut := filepath.Join(dir, "content.tar")
	fragOut := filepath.Join(dir, "installed.fragment")

	body := makeUnsignedApk(t, testPKGINFO, map[string]string{
		"usr/share/zoneinfo/UTC": "x",
	})
	if err := os.WriteFile(apk, body, 0o644); err != nil {
		t.Fatalf("write apk: %v", err)
	}

	if err := Extract(apk, contentOut, fragOut, "tzdata", "2026a-r0", "noarch"); err != nil {
		t.Fatalf("Extract: %v", err)
	}
	// Sanity-check that we got the zoneinfo file out of the data stream.
	raw, err := os.ReadFile(contentOut)
	if err != nil {
		t.Fatalf("read content: %v", err)
	}
	if !contains(tarEntryNames(t, raw), "usr/share/zoneinfo/UTC") {
		t.Errorf("content tar missing UTC: %v", tarEntryNames(t, raw))
	}
}

func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}

func TestExtract_Deterministic(t *testing.T) {
	dir := t.TempDir()
	apk := filepath.Join(dir, "tzdata.apk")
	body := makeApk(t, testPKGINFO, map[string]string{
		"usr/share/zoneinfo/UTC":           "utc",
		"usr/share/zoneinfo/Europe/Madrid": "madrid",
	})
	if err := os.WriteFile(apk, body, 0o644); err != nil {
		t.Fatalf("write apk: %v", err)
	}

	// Run extract twice into different files and compare hashes.
	sha := func(t *testing.T, path string) string {
		t.Helper()
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		sum := sha256.Sum256(raw)
		return hex.EncodeToString(sum[:])
	}

	out1 := filepath.Join(dir, "c1.tar")
	out2 := filepath.Join(dir, "c2.tar")
	frag1 := filepath.Join(dir, "f1.frag")
	frag2 := filepath.Join(dir, "f2.frag")
	if err := Extract(apk, out1, frag1, "tzdata", "2026a-r0", "noarch"); err != nil {
		t.Fatalf("Extract 1: %v", err)
	}
	if err := Extract(apk, out2, frag2, "tzdata", "2026a-r0", "noarch"); err != nil {
		t.Fatalf("Extract 2: %v", err)
	}
	if sha(t, out1) != sha(t, out2) {
		t.Errorf("content tar not byte-equal across runs")
	}
	if sha(t, frag1) != sha(t, frag2) {
		t.Errorf("fragment not byte-equal across runs")
	}
}

func tarEntryNames(t *testing.T, body []byte) []string {
	t.Helper()
	tr := tar.NewReader(bytes.NewReader(body))
	var names []string
	for {
		hdr, err := tr.Next()
		if err != nil {
			break
		}
		names = append(names, hdr.Name)
	}
	return names
}
