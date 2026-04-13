package file

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mustParseURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("url.Parse(%q): %v", raw, err)
	}
	return u
}

func TestProvider(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "secret.txt")
	if err := os.WriteFile(path, []byte("file-secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	u := mustParseURL(t, "file://"+path)
	data, err := Provider(context.Background(), u)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != "file-secret" {
		t.Errorf("got %q, want %q", data, "file-secret")
	}
}

func TestProvider_Missing(t *testing.T) {
	u := mustParseURL(t, "file:///nonexistent/path/secret.txt")
	_, err := Provider(context.Background(), u)
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestProvider_MissingPath(t *testing.T) {
	u := mustParseURL(t, "file://")
	_, err := Provider(context.Background(), u)
	if err == nil {
		t.Fatal("expected error for missing path")
	}
	if !strings.Contains(err.Error(), "missing path") {
		t.Errorf("unexpected error: %v", err)
	}
}
