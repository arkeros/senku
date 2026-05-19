package main

import (
	"archive/tar"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func writeFragment(t *testing.T, dir, name, body string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write fragment: %v", err)
	}
	return path
}

func readInstalledFromTar(t *testing.T, tarPath string) (string, bool) {
	t.Helper()
	f, err := os.Open(tarPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()
	tr := tar.NewReader(f)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return "", false
		}
		if err != nil {
			t.Fatalf("tar next: %v", err)
		}
		if hdr.Name == "./lib/apk/db/installed" {
			body, err := io.ReadAll(tr)
			if err != nil {
				t.Fatalf("read body: %v", err)
			}
			return string(body), true
		}
	}
}

func TestMerge_ConcatenatesSortedByPackageName(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "installed.tar")

	// Submit fragments in reverse-sorted order; expect output sorted.
	tz := writeFragment(t, dir, "tzdata.frag", "P:tzdata\nV:2026a-r0\nA:noarch\n\n")
	ca := writeFragment(t, dir, "ca.frag", "P:ca-certificates-bundle\nV:20251211-r0\nA:x86_64\n\n")
	bl := writeFragment(t, dir, "bl.frag", "P:wolfi-baselayout\nV:20251210-r0\nA:noarch\n\n")

	if err := Merge([]string{tz, bl, ca}, out); err != nil {
		t.Fatalf("Merge: %v", err)
	}

	body, ok := readInstalledFromTar(t, out)
	if !ok {
		t.Fatal("output tar missing /lib/apk/db/installed")
	}

	want := "" +
		"P:ca-certificates-bundle\nV:20251211-r0\nA:x86_64\n\n" +
		"P:tzdata\nV:2026a-r0\nA:noarch\n\n" +
		"P:wolfi-baselayout\nV:20251210-r0\nA:noarch\n\n"
	if body != want {
		t.Errorf("body mismatch:\n got:\n%s\nwant:\n%s", body, want)
	}
}

func TestMerge_Deterministic(t *testing.T) {
	dir := t.TempDir()
	tz := writeFragment(t, dir, "a.frag", "P:tzdata\nV:1-r0\nA:noarch\n\n")
	ca := writeFragment(t, dir, "b.frag", "P:ca-certificates-bundle\nV:1-r0\nA:noarch\n\n")

	out1 := filepath.Join(dir, "1.tar")
	out2 := filepath.Join(dir, "2.tar")
	if err := Merge([]string{tz, ca}, out1); err != nil {
		t.Fatalf("Merge 1: %v", err)
	}
	if err := Merge([]string{ca, tz}, out2); err != nil { // reversed input
		t.Fatalf("Merge 2: %v", err)
	}

	sha := func(t *testing.T, p string) string {
		t.Helper()
		raw, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		sum := sha256.Sum256(raw)
		return hex.EncodeToString(sum[:])
	}
	if sha(t, out1) != sha(t, out2) {
		t.Errorf("output not byte-equal across input orderings")
	}
}

func TestMerge_NormalisesTrailingNewlines(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "installed.tar")

	// Fragment without trailing blank line — should still concatenate cleanly.
	noBlank := writeFragment(t, dir, "n.frag", "P:noblank\nV:1-r0\nA:noarch\n")
	hasBlank := writeFragment(t, dir, "h.frag", "P:hasblank\nV:1-r0\nA:noarch\n\n")

	if err := Merge([]string{noBlank, hasBlank}, out); err != nil {
		t.Fatalf("Merge: %v", err)
	}
	body, _ := readInstalledFromTar(t, out)
	// Both records should be separated by a blank line.
	if !bytes.Contains([]byte(body), []byte("A:noarch\n\nP:noblank\n")) {
		t.Errorf("missing blank separator between records\ngot:\n%s", body)
	}
}

func TestMerge_FragmentMissingPLineFails(t *testing.T) {
	dir := t.TempDir()
	bad := writeFragment(t, dir, "bad.frag", "V:1\nA:x86_64\n\n")
	err := Merge([]string{bad}, filepath.Join(dir, "out.tar"))
	if err == nil {
		t.Fatal("expected error on fragment without P: line")
	}
}

func TestMerge_OutputContainsParentDirEntries(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "installed.tar")
	frag := writeFragment(t, dir, "f.frag", "P:foo\nV:1-r0\nA:noarch\n\n")
	if err := Merge([]string{frag}, out); err != nil {
		t.Fatalf("Merge: %v", err)
	}

	f, err := os.Open(out)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()
	tr := tar.NewReader(f)
	seen := map[string]bool{}
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("tar next: %v", err)
		}
		seen[hdr.Name] = true
	}
	for _, want := range []string{"./lib/", "./lib/apk/", "./lib/apk/db/", "./lib/apk/db/installed"} {
		if !seen[want] {
			t.Errorf("output tar missing entry %q (got %v)", want, seen)
		}
	}
}
