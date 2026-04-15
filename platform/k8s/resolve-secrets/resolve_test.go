package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"

	"github.com/arkeros/senku/platform/secrets"
	"github.com/arkeros/senku/platform/secrets/env"
	"github.com/arkeros/senku/platform/secrets/file"
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

// --- resolveSecret ---

func TestResolveSecret_StringData(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "gcp:///projects/myproject/secrets/db-pass/versions/3",
		},
	}
	fetch := mockFetcher(map[string]string{
		"gcp:///projects/myproject/secrets/db-pass/versions/3": "s3cret",
	})

	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["password"]) != "s3cret" {
		t.Errorf("Data[password] = %q, want %q", secret.Data["password"], "s3cret")
	}
	if len(secret.StringData) != 0 {
		t.Errorf("StringData should be empty after resolution, got %v", secret.StringData)
	}
}

func TestResolveSecret_DataURIResolved(t *testing.T) {
	secret := &corev1.Secret{
		Data: map[string][]byte{
			"password": []byte("gcp:///projects/myproject/secrets/db-pass/versions/3"),
		},
	}
	fetch := mockFetcher(map[string]string{
		"gcp:///projects/myproject/secrets/db-pass/versions/3": "s3cret",
	})

	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["password"]) != "s3cret" {
		t.Errorf("got %q, want %q", secret.Data["password"], "s3cret")
	}
}

func TestResolveSecret_DataNonURIPassthrough(t *testing.T) {
	secret := &corev1.Secret{
		Data: map[string][]byte{
			"password": []byte("just-a-plain-value"),
		},
	}
	fetch := mockFetcher(map[string]string{})

	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["password"]) != "just-a-plain-value" {
		t.Errorf("data should be unchanged, got %q", secret.Data["password"])
	}
}

func TestResolveSecret_EmptySecret(t *testing.T) {
	secret := &corev1.Secret{}
	if err := resolveSecret(context.Background(), secret, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResolveSecret_EnvProvider(t *testing.T) {
	t.Setenv("DB_PASSWORD", "env-secret")

	fetch := secrets.NewFetcher(map[string]secrets.Provider{
		"env": env.Provider,
	})

	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "env://DB_PASSWORD",
		},
	}
	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["password"]) != "env-secret" {
		t.Errorf("got %q, want %q", secret.Data["password"], "env-secret")
	}
}

func TestResolveSecret_FileProvider(t *testing.T) {
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
	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["token"]) != "file-token" {
		t.Errorf("got %q, want %q", secret.Data["token"], "file-token")
	}
}

func TestResolveSecret_MixedProviders(t *testing.T) {
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
	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["db-pass"]) != "gcp-password" {
		t.Errorf("got %q, want %q", secret.Data["db-pass"], "gcp-password")
	}
	if string(secret.Data["api-key"]) != "key-123" {
		t.Errorf("got %q, want %q", secret.Data["api-key"], "key-123")
	}
	if string(secret.Data["cert"]) != "CERT-DATA" {
		t.Errorf("got %q, want %q", secret.Data["cert"], "CERT-DATA")
	}
}

func TestResolveSecret_RejectsNoScheme(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "just-a-plain-string",
		},
	}
	fetch := secrets.NewFetcher(map[string]secrets.Provider{})
	err := resolveSecret(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for missing scheme, got nil")
	}
	if !strings.Contains(err.Error(), "missing scheme") {
		t.Errorf("expected missing scheme error, got: %v", err)
	}
}

func TestResolveSecret_RejectsUnknownScheme(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "bogus://something",
		},
	}
	fetch := secrets.NewFetcher(map[string]secrets.Provider{})
	err := resolveSecret(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for unknown scheme, got nil")
	}
	if !strings.Contains(err.Error(), "unknown secret provider scheme") {
		t.Errorf("expected unknown scheme error, got: %v", err)
	}
}

func TestResolveSecret_FetchError(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"password": "gcp:///projects/p/secrets/missing/versions/1",
		},
	}
	fetch := mockFetcher(map[string]string{})
	err := resolveSecret(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for missing secret, got nil")
	}
	if !strings.Contains(err.Error(), "secret not found") {
		t.Errorf("expected not found error, got: %v", err)
	}
}

func TestResolveSecret_DataFetchError(t *testing.T) {
	secret := &corev1.Secret{
		Data: map[string][]byte{
			"password": []byte("gcp:///projects/p/secrets/missing/versions/1"),
		},
	}
	fetch := mockFetcher(map[string]string{})
	err := resolveSecret(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for missing secret, got nil")
	}
	if !strings.Contains(err.Error(), "secret not found") {
		t.Errorf("expected not found error, got: %v", err)
	}
}

func TestResolveSecret_StringDataValueLooksLikeURI(t *testing.T) {
	// A secret whose resolved value happens to be a valid URI must NOT
	// be re-resolved via the Data loop.
	secret := &corev1.Secret{
		StringData: map[string]string{
			"redirect": "test://config",
		},
	}
	fetch := mockFetcher(map[string]string{
		"test://config": "gcp:///projects/p/secrets/nested/versions/1",
		// If double-resolution happened, this would be fetched:
		"gcp:///projects/p/secrets/nested/versions/1": "SHOULD NOT REACH",
	})

	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "gcp:///projects/p/secrets/nested/versions/1"
	if string(secret.Data["redirect"]) != want {
		t.Errorf("Data[redirect] = %q, want %q (value should not be re-resolved)", secret.Data["redirect"], want)
	}
}

func TestResolveSecret_SameKeyInDataAndStringData(t *testing.T) {
	// If a key exists in both Data and StringData, StringData wins (per K8s
	// semantics) and the resolved value must NOT be re-resolved in Pass 3.
	secret := &corev1.Secret{
		Data: map[string][]byte{
			"token": []byte("gcp:///projects/p/secrets/old/versions/1"),
		},
		StringData: map[string]string{
			"token": "test://config",
		},
	}
	fetch := mockFetcher(map[string]string{
		"test://config":                                "gcp:///projects/p/secrets/nested/versions/1",
		"gcp:///projects/p/secrets/old/versions/1":     "OLD-VALUE",
		"gcp:///projects/p/secrets/nested/versions/1":  "SHOULD NOT REACH",
	})

	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "gcp:///projects/p/secrets/nested/versions/1"
	if got := string(secret.Data["token"]); got != want {
		t.Errorf("Data[token] = %q, want %q (StringData value should not be re-resolved)", got, want)
	}
}

// --- Spread ---

func TestResolveSecret_Spread(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"...db": "test://db-config",
		},
	}
	fetch := mockFetcher(map[string]string{
		"test://db-config": `{"username":"admin","password":"s3cret"}`,
	})

	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["username"]) != "admin" {
		t.Errorf("Data[username] = %q, want %q", secret.Data["username"], "admin")
	}
	if string(secret.Data["password"]) != "s3cret" {
		t.Errorf("Data[password] = %q, want %q", secret.Data["password"], "s3cret")
	}
	if _, ok := secret.Data["...db"]; ok {
		t.Error("spread key ...db should not appear in Data")
	}
}

func TestResolveSecret_SpreadMultiple(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"...db":    "test://db-config",
			"...redis": "test://redis-config",
		},
	}
	fetch := mockFetcher(map[string]string{
		"test://db-config":    `{"db-host":"db.internal"}`,
		"test://redis-config": `{"redis-host":"redis.internal"}`,
	})

	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["db-host"]) != "db.internal" {
		t.Errorf("Data[db-host] = %q, want %q", secret.Data["db-host"], "db.internal")
	}
	if string(secret.Data["redis-host"]) != "redis.internal" {
		t.Errorf("Data[redis-host] = %q, want %q", secret.Data["redis-host"], "redis.internal")
	}
}

func TestResolveSecret_SpreadCollision(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"...a": "test://a",
			"...b": "test://b",
		},
	}
	fetch := mockFetcher(map[string]string{
		"test://a": `{"host":"a.internal"}`,
		"test://b": `{"host":"b.internal"}`,
	})

	err := resolveSecret(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for spread collision")
	}
	if !strings.Contains(err.Error(), "host") {
		t.Errorf("error should mention colliding key, got: %v", err)
	}
}

func TestResolveSecret_SpreadExplicitOverride(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"...db": "test://db-config",
			"port":  "test://custom-port",
		},
	}
	fetch := mockFetcher(map[string]string{
		"test://db-config":   `{"host":"db.internal","port":"5432"}`,
		"test://custom-port": "5433",
	})

	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["host"]) != "db.internal" {
		t.Errorf("Data[host] = %q, want %q", secret.Data["host"], "db.internal")
	}
	if string(secret.Data["port"]) != "5433" {
		t.Errorf("Data[port] = %q, want %q (explicit should win)", secret.Data["port"], "5433")
	}
}

func TestResolveSecret_SpreadWithTransforms(t *testing.T) {
	providers := map[string]secrets.Provider{
		"test": func(_ context.Context, u *url.URL) ([]byte, error) {
			return []byte("eyJ1c2VyIjoiYWRtaW4ifQ=="), nil // base64(`{"user":"admin"}`)
		},
	}
	fetch := secrets.NewFetcher(providers)

	secret := &corev1.Secret{
		StringData: map[string]string{
			"...cfg": "test://config?payload=base64",
		},
	}
	if err := resolveSecret(context.Background(), secret, fetch); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(secret.Data["user"]) != "admin" {
		t.Errorf("Data[user] = %q, want %q", secret.Data["user"], "admin")
	}
}

func TestResolveSecret_SpreadNonObject(t *testing.T) {
	secret := &corev1.Secret{
		StringData: map[string]string{
			"...x": "test://not-object",
		},
	}
	fetch := mockFetcher(map[string]string{
		"test://not-object": `"just a string"`,
	})

	err := resolveSecret(context.Background(), secret, fetch)
	if err == nil {
		t.Fatal("expected error for non-object spread")
	}
}
