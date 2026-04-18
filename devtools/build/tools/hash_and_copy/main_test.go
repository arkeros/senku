package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHashedName(t *testing.T) {
	tests := []struct {
		name       string
		origName   string
		data       []byte
		wantPrefix string
		wantExt    string
	}{
		{"svg", "logo.svg", []byte("<svg/>"), "logo.", ".svg"},
		{"woff2", "Inter.woff2", []byte{0xDE, 0xAD}, "Inter.", ".woff2"},
		{"path traversal stripped to basename", "../../etc/passwd.txt", []byte("attack"), "passwd.", ".txt"},
		{"no extension", "Makefile", []byte("rule"), "Makefile.", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := hashedName(tc.origName, tc.data)
			if !strings.HasPrefix(got, tc.wantPrefix) {
				t.Errorf("hashedName(%q) = %q; want prefix %q", tc.origName, got, tc.wantPrefix)
			}
			if !strings.HasSuffix(got, tc.wantExt) {
				t.Errorf("hashedName(%q) = %q; want suffix %q", tc.origName, got, tc.wantExt)
			}
			if strings.ContainsAny(got, "/\\") {
				t.Errorf("hashedName(%q) = %q leaked a path separator", tc.origName, got)
			}
		})
	}
}

func TestHashedNameLength(t *testing.T) {
	got := hashedName("a.svg", []byte("x"))
	// Expected shape: "a.<12 hex>.svg" => 2 + 12 + 4 = 18
	if len(got) != len("a.")+hashLen+len(".svg") {
		t.Errorf("hashedName hash segment wrong length: %q (total %d)", got, len(got))
	}
}

func TestHashedNameDeterministic(t *testing.T) {
	a := hashedName("logo.svg", []byte("hello"))
	b := hashedName("logo.svg", []byte("hello"))
	if a != b {
		t.Errorf("not deterministic: %q vs %q", a, b)
	}
}

func TestHashedNameContentSensitive(t *testing.T) {
	a := hashedName("logo.svg", []byte("a"))
	b := hashedName("logo.svg", []byte("b"))
	if a == b {
		t.Errorf("same hashed name for different content: %q", a)
	}
}

func TestRunWritesManifestAndFiles(t *testing.T) {
	tmp := t.TempDir()
	src := filepath.Join(tmp, "logo.svg")
	if err := os.WriteFile(src, []byte("<svg/>"), 0o644); err != nil {
		t.Fatal(err)
	}
	outDir := filepath.Join(tmp, "out")
	manifestPath := filepath.Join(tmp, "manifest.json")

	if err := run(outDir, manifestPath, []string{src}); err != nil {
		t.Fatal(err)
	}

	manifest := readManifest(t, manifestPath)
	hashed, ok := manifest["logo.svg"]
	if !ok {
		t.Fatalf("manifest missing logo.svg key: %v", manifest)
	}

	if _, err := os.Stat(filepath.Join(outDir, hashed)); err != nil {
		t.Errorf("hashed file missing from out-dir: %v", err)
	}
}

func TestRunPathTraversalDefense(t *testing.T) {
	tmp := t.TempDir()
	deep := filepath.Join(tmp, "a", "b", "c")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(deep, "logo.svg")
	if err := os.WriteFile(src, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	outDir := filepath.Join(tmp, "out")
	manifestPath := filepath.Join(tmp, "manifest.json")

	if err := run(outDir, manifestPath, []string{src}); err != nil {
		t.Fatal(err)
	}

	manifest := readManifest(t, manifestPath)
	if _, ok := manifest["logo.svg"]; !ok {
		t.Errorf("manifest key should be basename; got %v", manifest)
	}

	entries, err := os.ReadDir(outDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.ContainsAny(e.Name(), "/\\") {
			t.Errorf("output file escaped out-dir: %s", e.Name())
		}
	}
}

func TestRunCollisionFails(t *testing.T) {
	tmp := t.TempDir()
	// Two different srcs with the same basename — must fail.
	dirA := filepath.Join(tmp, "a")
	dirB := filepath.Join(tmp, "b")
	for _, d := range []string{dirA, dirB} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	srcA := filepath.Join(dirA, "logo.svg")
	srcB := filepath.Join(dirB, "logo.svg")
	if err := os.WriteFile(srcA, []byte("A"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(srcB, []byte("B"), 0o644); err != nil {
		t.Fatal(err)
	}

	outDir := filepath.Join(tmp, "out")
	manifestPath := filepath.Join(tmp, "manifest.json")

	err := run(outDir, manifestPath, []string{srcA, srcB})
	if err == nil {
		t.Fatal("expected collision error for duplicate basenames; got nil")
	}
	if !strings.Contains(err.Error(), "logo.svg") {
		t.Errorf("error should name the colliding basename; got %v", err)
	}
}

func readManifest(t *testing.T, path string) map[string]string {
	t.Helper()
	buf, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]string
	if err := json.Unmarshal(buf, &m); err != nil {
		t.Fatal(err)
	}
	return m
}
