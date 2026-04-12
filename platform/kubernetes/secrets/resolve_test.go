package secrets_test

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"

	"github.com/arkeros/senku/platform/kubernetes/secrets"
	"github.com/arkeros/senku/platform/kubernetes/secrets/providers/env"
	"github.com/arkeros/senku/platform/kubernetes/secrets/providers/file"
)

func mockFetcher(m map[string]string) secrets.Fetcher {
	return func(_ context.Context, uri string) ([]byte, error) {
		val, ok := m[uri]
		if !ok {
			return nil, fmt.Errorf("secret not found: %s", uri)
		}
		return []byte(val), nil
	}
}

// --- NewFetcher dispatch ---

func TestNewFetcher_Dispatch(t *testing.T) {
	var called *url.URL
	providers := map[string]secrets.Provider{
		"test": func(_ context.Context, u *url.URL) ([]byte, error) {
			called = u
			return []byte("resolved"), nil
		},
	}
	fetch := secrets.NewFetcher(providers)

	payload, err := fetch(context.Background(), "test://my-host/my-path")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(payload) != "resolved" {
		t.Errorf("got %q, want %q", payload, "resolved")
	}
	if called.Host != "my-host" {
		t.Errorf("provider called with host %q, want %q", called.Host, "my-host")
	}
	if called.Path != "/my-path" {
		t.Errorf("provider called with path %q, want %q", called.Path, "/my-path")
	}
}

func TestNewFetcher_UnknownScheme(t *testing.T) {
	fetch := secrets.NewFetcher(map[string]secrets.Provider{})
	_, err := fetch(context.Background(), "bogus://ref")
	if err == nil {
		t.Fatal("expected error for unknown scheme")
	}
	if !strings.Contains(err.Error(), "unknown secret provider scheme") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNewFetcher_MissingScheme(t *testing.T) {
	fetch := secrets.NewFetcher(map[string]secrets.Provider{})
	_, err := fetch(context.Background(), "plain-value")
	if err == nil {
		t.Fatal("expected error for missing scheme")
	}
	if !strings.Contains(err.Error(), "missing scheme") {
		t.Errorf("unexpected error: %v", err)
	}
}

// --- Resolve ---

func TestResolve_StringData(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "gcp:///projects/myproject/secrets/db-pass/versions/3",
		},
	}
	fetch := mockFetcher(map[string]string{
		"gcp:///projects/myproject/secrets/db-pass/versions/3": "s3cret",
	})

	if err := secrets.Resolve(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if secret.StringData["password"] != "s3cret" {
		t.Errorf("got %q, want %q", secret.StringData["password"], "s3cret")
	}
}

func TestResolve_DataURIResolved(t *testing.T) {
	secret := &corev1.Secret{
		Data: map[string][]byte{
			"password": []byte("gcp:///projects/myproject/secrets/db-pass/versions/3"),
		},
	}
	fetch := mockFetcher(map[string]string{
		"gcp:///projects/myproject/secrets/db-pass/versions/3": "s3cret",
	})

	if err := secrets.Resolve(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["password"]) != "s3cret" {
		t.Errorf("got %q, want %q", secret.Data["password"], "s3cret")
	}
}

func TestResolve_DataNonURIPassthrough(t *testing.T) {
	secret := &corev1.Secret{
		Data: map[string][]byte{
			"password": []byte("just-a-plain-value"),
		},
	}
	fetch := mockFetcher(map[string]string{})

	if err := secrets.Resolve(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["password"]) != "just-a-plain-value" {
		t.Errorf("data should be unchanged, got %q", secret.Data["password"])
	}
}

func TestResolve_EmptySecret(t *testing.T) {
	secret := &corev1.Secret{}
	if err := secrets.Resolve(context.Background(), secret, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResolve_EnvProvider(t *testing.T) {
	t.Setenv("DB_PASSWORD", "env-secret")

	fetch := secrets.NewFetcher(map[string]secrets.Provider{
		"env": env.Provider,
	})

	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "env://DB_PASSWORD",
		},
	}
	if err := secrets.Resolve(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if secret.StringData["password"] != "env-secret" {
		t.Errorf("got %q, want %q", secret.StringData["password"], "env-secret")
	}
}

func TestResolve_FileProvider(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "token")
	if err := os.WriteFile(path, []byte("file-token"), 0o600); err != nil {
		t.Fatal(err)
	}

	fetch := secrets.NewFetcher(map[string]secrets.Provider{
		"file": file.Provider,
	})

	secret := &corev1.Secret{
		StringData: map[string]string{
			"token": "file://" + path,
		},
	}
	if err := secrets.Resolve(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if secret.StringData["token"] != "file-token" {
		t.Errorf("got %q, want %q", secret.StringData["token"], "file-token")
	}
}

func TestResolve_MixedProviders(t *testing.T) {
	t.Setenv("API_KEY", "key-123")

	dir := t.TempDir()
	certPath := filepath.Join(dir, "cert.pem")
	if err := os.WriteFile(certPath, []byte("CERT-DATA"), 0o600); err != nil {
		t.Fatal(err)
	}

	mockGCP := func(_ context.Context, u *url.URL) ([]byte, error) {
		if u.Path == "/projects/p/secrets/db-pass/versions/1" {
			return []byte("gcp-password"), nil
		}
		return nil, fmt.Errorf("not found: %s", u)
	}

	fetch := secrets.NewFetcher(map[string]secrets.Provider{
		"gcp":  mockGCP,
		"env":  env.Provider,
		"file": file.Provider,
	})

	secret := &corev1.Secret{
		StringData: map[string]string{
			"db-pass": "gcp:///projects/p/secrets/db-pass/versions/1",
			"api-key": "env://API_KEY",
			"cert":    "file://" + certPath,
		},
	}
	if err := secrets.Resolve(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if secret.StringData["db-pass"] != "gcp-password" {
		t.Errorf("got %q, want %q", secret.StringData["db-pass"], "gcp-password")
	}
	if secret.StringData["api-key"] != "key-123" {
		t.Errorf("got %q, want %q", secret.StringData["api-key"], "key-123")
	}
	if secret.StringData["cert"] != "CERT-DATA" {
		t.Errorf("got %q, want %q", secret.StringData["cert"], "CERT-DATA")
	}
}

func TestResolve_RejectsNoScheme(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "just-a-plain-string",
		},
	}
	fetch := secrets.NewFetcher(map[string]secrets.Provider{})
	err := secrets.Resolve(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for missing scheme, got nil")
	}
	if !strings.Contains(err.Error(), "missing scheme") {
		t.Errorf("expected missing scheme error, got: %v", err)
	}
}

func TestResolve_RejectsUnknownScheme(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "bogus://something",
		},
	}
	fetch := secrets.NewFetcher(map[string]secrets.Provider{})
	err := secrets.Resolve(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for unknown scheme, got nil")
	}
	if !strings.Contains(err.Error(), "unknown secret provider scheme") {
		t.Errorf("expected unknown scheme error, got: %v", err)
	}
}

func TestResolve_FetchError(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "gcp:///projects/p/secrets/missing/versions/1",
		},
	}
	fetch := mockFetcher(map[string]string{})
	err := secrets.Resolve(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for missing secret, got nil")
	}
	if !strings.Contains(err.Error(), "secret not found") {
		t.Errorf("expected not found error, got: %v", err)
	}
}

func TestResolve_DataFetchError(t *testing.T) {
	secret := &corev1.Secret{
		Data: map[string][]byte{
			"password": []byte("gcp:///projects/p/secrets/missing/versions/1"),
		},
	}
	fetch := mockFetcher(map[string]string{})
	err := secrets.Resolve(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for missing secret, got nil")
	}
	if !strings.Contains(err.Error(), "secret not found") {
		t.Errorf("expected not found error, got: %v", err)
	}
}
