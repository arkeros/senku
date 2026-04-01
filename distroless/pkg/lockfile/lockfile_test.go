package lockfile

import (
	"os"
	"path/filepath"
	"testing"
)

const testLockJSON = `{
	"packages": [
		{
			"arch": "amd64",
			"dependencies": [],
			"key": "base-files_13.8-p-deb13u4_amd64",
			"name": "base-files",
			"sha256": "abc123",
			"urls": ["https://snapshot.debian.org/archive/debian/20260320T143128Z/pool/main/b/base-files/base-files_13.8+deb13u4_amd64.deb"],
			"version": "13.8+deb13u4"
		},
		{
			"arch": "amd64",
			"dependencies": [],
			"key": "libc6_2.41-12-p-deb13u2_amd64",
			"name": "libc6",
			"sha256": "def456",
			"urls": ["https://snapshot.debian.org/archive/debian/20260320T143128Z/pool/main/g/glibc/libc6_2.41-12+deb13u2_amd64.deb"],
			"version": "2.41-12+deb13u2"
		},
		{
			"arch": "arm64",
			"dependencies": [],
			"key": "base-files_13.8-p-deb13u4_arm64",
			"name": "base-files",
			"sha256": "ghi789",
			"urls": ["https://snapshot.debian.org/archive/debian/20260320T143128Z/pool/main/b/base-files/base-files_13.8+deb13u4_arm64.deb"],
			"version": "13.8+deb13u4"
		},
		{
			"arch": "arm64",
			"dependencies": [],
			"key": "libc6_2.41-12-p-deb13u2_arm64",
			"name": "libc6",
			"sha256": "jkl012",
			"urls": ["https://snapshot.debian.org/archive/debian/20260320T143128Z/pool/main/g/glibc/libc6_2.41-12+deb13u2_arm64.deb"],
			"version": "2.41-12+deb13u2"
		}
	]
}`

func TestParseLockFile(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test.lock.json")
	if err := os.WriteFile(path, []byte(testLockJSON), 0o644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	lock, err := ParseFile(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(lock.Packages) != 4 {
		t.Errorf("expected 4 packages, got %d", len(lock.Packages))
	}
}

func TestVersions(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test.lock.json")
	if err := os.WriteFile(path, []byte(testLockJSON), 0o644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	lock, err := ParseFile(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	versions := lock.Versions()

	// Should deduplicate across architectures
	if len(versions) != 2 {
		t.Fatalf("expected 2 unique packages, got %d", len(versions))
	}

	if v, ok := versions["base-files"]; !ok || v != "13.8+deb13u4" {
		t.Errorf("expected base-files 13.8+deb13u4, got %q", v)
	}

	if v, ok := versions["libc6"]; !ok || v != "2.41-12+deb13u2" {
		t.Errorf("expected libc6 2.41-12+deb13u2, got %q", v)
	}
}

func TestVersionsByArch(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test.lock.json")
	if err := os.WriteFile(path, []byte(testLockJSON), 0o644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	lock, err := ParseFile(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	byArch := lock.VersionsByArch()

	if len(byArch) != 2 {
		t.Fatalf("expected 2 architectures, got %d", len(byArch))
	}

	amd64 := byArch["amd64"]
	if len(amd64) != 2 {
		t.Errorf("expected 2 amd64 packages, got %d", len(amd64))
	}

	arm64 := byArch["arm64"]
	if len(arm64) != 2 {
		t.Errorf("expected 2 arm64 packages, got %d", len(arm64))
	}
}

const testLockCrossArchJSON = `{
	"packages": [
		{
			"arch": "amd64",
			"dependencies": [],
			"key": "sed_4.9-2-p-b1_amd64",
			"name": "sed",
			"sha256": "aaa",
			"urls": ["https://example.com/sed_4.9-2+b1_amd64.deb"],
			"version": "4.9-2+b1"
		},
		{
			"arch": "arm64",
			"dependencies": [],
			"key": "sed_4.9-2-p-b2_arm64",
			"name": "sed",
			"sha256": "bbb",
			"urls": ["https://example.com/sed_4.9-2+b2_arm64.deb"],
			"version": "4.9-2+b2"
		},
		{
			"arch": "amd64",
			"dependencies": [],
			"key": "libc6_2.41_amd64",
			"name": "libc6",
			"sha256": "ccc",
			"urls": ["https://example.com/libc6_2.41_amd64.deb"],
			"version": "2.41"
		},
		{
			"arch": "arm64",
			"dependencies": [],
			"key": "libc6_2.41_arm64",
			"name": "libc6",
			"sha256": "ddd",
			"urls": ["https://example.com/libc6_2.41_arm64.deb"],
			"version": "2.41"
		}
	]
}`

func TestVersionsCrossArchDifference(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test.lock.json")
	if err := os.WriteFile(path, []byte(testLockCrossArchJSON), 0o644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	lock, err := ParseFile(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	versions := lock.Versions()

	// libc6 has the same version across arches — should appear once
	if v, ok := versions["libc6"]; !ok || v != "2.41" {
		t.Errorf("expected libc6 2.41, got %q", v)
	}

	// sed differs across arches — should have arch-qualified keys
	if _, ok := versions["sed (amd64)"]; !ok {
		t.Error("expected 'sed (amd64)' entry for cross-arch version difference")
	}
	if _, ok := versions["sed (arm64)"]; !ok {
		t.Error("expected 'sed (arm64)' entry for cross-arch version difference")
	}
	// plain "sed" should not exist when versions differ
	if _, ok := versions["sed"]; ok {
		t.Error("plain 'sed' should not exist when versions differ across arches")
	}
}

func TestParseLockFileNotFound(t *testing.T) {
	_, err := ParseFile("/nonexistent/file.json")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestParseLockFileInvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "bad.lock.json")
	if err := os.WriteFile(path, []byte("not json"), 0o644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	_, err := ParseFile(path)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}
