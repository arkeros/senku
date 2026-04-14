package mem

import (
	"context"
	"net/url"
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
	p := Provider(map[string]string{"db-pass": "s3cret"})
	data, err := p(context.Background(), mustParseURL(t, "mem://db-pass"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != "s3cret" {
		t.Errorf("got %q, want %q", data, "s3cret")
	}
}

func TestProvider_NotFound(t *testing.T) {
	p := Provider(map[string]string{})
	_, err := p(context.Background(), mustParseURL(t, "mem://missing"))
	if err == nil {
		t.Fatal("expected error for missing secret")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("unexpected error: %v", err)
	}
}
