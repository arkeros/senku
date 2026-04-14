package env

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
	t.Setenv("TEST_SECRET_VALUE", "s3cret")
	u := mustParseURL(t, "env://TEST_SECRET_VALUE")
	data, err := Provider(context.Background(), u)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != "s3cret" {
		t.Errorf("got %q, want %q", data, "s3cret")
	}
}

func TestProvider_Unset(t *testing.T) {
	u := mustParseURL(t, "env://DEFINITELY_NOT_SET_12345")
	_, err := Provider(context.Background(), u)
	if err == nil {
		t.Fatal("expected error for unset env var")
	}
	if !strings.Contains(err.Error(), "not set") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestProvider_MissingName(t *testing.T) {
	u := mustParseURL(t, "env:///")
	_, err := Provider(context.Background(), u)
	if err == nil {
		t.Fatal("expected error for missing variable name")
	}
	if !strings.Contains(err.Error(), "missing variable name") {
		t.Errorf("unexpected error: %v", err)
	}
}
