package main

import (
	"bytes"
	"context"
	"os"
	"testing"

	"github.com/arkeros/senku/platform/kubernetes/secrets"
	"github.com/arkeros/senku/platform/kubernetes/secrets/providers/mem"
	"github.com/arkeros/senku/testing/golden"
)

func testFetcher() secrets.Fetcher {
	return secrets.NewFetcher(map[string]secrets.Provider{
		"mem": mem.Provider(map[string]string{
			"db-pass": "s3cret-password",
			"api-key": "key-abc-123",
			"token":   "tok_xyz",
		}),
	})
}

func TestResolveManifest_Mixed(t *testing.T) {
	t.Parallel()

	f, err := os.Open("testdata/mixed.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	var buf bytes.Buffer
	if err := resolveManifest(context.Background(), f, &buf, testFetcher()); err != nil {
		t.Fatalf("resolveManifest() error = %v", err)
	}

	golden.Compare(t, buf.Bytes(), "testdata/mixed.golden.yaml")
}

func TestResolveManifest_SecretOnly(t *testing.T) {
	t.Parallel()

	f, err := os.Open("testdata/secret_only.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	var buf bytes.Buffer
	if err := resolveManifest(context.Background(), f, &buf, testFetcher()); err != nil {
		t.Fatalf("resolveManifest() error = %v", err)
	}

	golden.Compare(t, buf.Bytes(), "testdata/secret_only.golden.yaml")
}

func TestResolveManifest_Transforms(t *testing.T) {
	t.Parallel()

	fetch := secrets.NewFetcher(map[string]secrets.Provider{
		"mem": mem.Provider(map[string]string{
			"db-config":                `{"password":"s3cret","database":{"host":"db.internal"}}`,
			"json-with-b64-field":      `{"tls_cert":"aGVsbG8="}`,
			"b64-json":                 "eyJwYXNzd29yZCI6InMzY3JldCJ9",                 // base64(`{"password":"s3cret"}`)
			"b64-json-with-b64-field":  "eyJjZXJ0IjoiYUdWc2JHOD0ifQ==",                 // base64(`{"cert":"aGVsbG8="}`)
		}),
	})

	f, err := os.Open("testdata/transforms.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	var buf bytes.Buffer
	if err := resolveManifest(context.Background(), f, &buf, fetch); err != nil {
		t.Fatalf("resolveManifest() error = %v", err)
	}

	golden.Compare(t, buf.Bytes(), "testdata/transforms.golden.yaml")
}

func TestResolveManifest_Spread(t *testing.T) {
	t.Parallel()

	fetch := secrets.NewFetcher(map[string]secrets.Provider{
		"mem": mem.Provider(map[string]string{
			"db-config":    `{"host":"db.internal","port":"5432","user":"admin"}`,
			"redis-config": `{"redis-host":"redis.internal","redis-port":"6379"}`,
			"custom-port":  "5433",
		}),
	})

	f, err := os.Open("testdata/spread.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	var buf bytes.Buffer
	if err := resolveManifest(context.Background(), f, &buf, fetch); err != nil {
		t.Fatalf("resolveManifest() error = %v", err)
	}

	golden.Compare(t, buf.Bytes(), "testdata/spread.golden.yaml")
}

func TestResolveManifest_NoSecrets(t *testing.T) {
	t.Parallel()

	f, err := os.Open("testdata/no_secrets.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	var buf bytes.Buffer
	if err := resolveManifest(context.Background(), f, &buf, testFetcher()); err != nil {
		t.Fatalf("resolveManifest() error = %v", err)
	}

	golden.Compare(t, buf.Bytes(), "testdata/no_secrets.golden.yaml")
}
