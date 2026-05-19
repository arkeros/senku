package apkkey

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mustGenKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	return k
}

func mustEncodePKIX(t *testing.T, k *rsa.PublicKey) []byte {
	t.Helper()
	der, err := x509.MarshalPKIXPublicKey(k)
	if err != nil {
		t.Fatalf("MarshalPKIXPublicKey: %v", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
}

func mustEncodePKCS1(t *testing.T, k *rsa.PublicKey) []byte {
	t.Helper()
	der := x509.MarshalPKCS1PublicKey(k)
	return pem.EncodeToMemory(&pem.Block{Type: "RSA PUBLIC KEY", Bytes: der})
}

func TestParse_SinglePKIXBlock(t *testing.T) {
	k := mustGenKey(t)
	pemBytes := mustEncodePKIX(t, &k.PublicKey)

	keys, err := Parse(pemBytes)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("got %d keys, want 1", len(keys))
	}
	if keys[0].N.Cmp(k.PublicKey.N) != 0 {
		t.Fatal("parsed modulus does not match input")
	}
}

func TestParse_PKCS1Block(t *testing.T) {
	k := mustGenKey(t)
	pemBytes := mustEncodePKCS1(t, &k.PublicKey)

	keys, err := Parse(pemBytes)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("got %d keys, want 1", len(keys))
	}
}

func TestParse_MultiBlockBundle(t *testing.T) {
	k1 := mustGenKey(t)
	k2 := mustGenKey(t)
	bundle := append(mustEncodePKIX(t, &k1.PublicKey), mustEncodePKIX(t, &k2.PublicKey)...)

	keys, err := Parse(bundle)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(keys) != 2 {
		t.Fatalf("got %d keys, want 2", len(keys))
	}
}

func TestParse_SkipsUnparseableBlockWhenOthersSucceed(t *testing.T) {
	good := mustGenKey(t)
	garbage := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: []byte("not valid DER")})
	bundle := append(garbage, mustEncodePKIX(t, &good.PublicKey)...)

	keys, err := Parse(bundle)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("got %d keys, want 1 (garbage should be skipped)", len(keys))
	}
}

func TestParse_AllBlocksFail_SurfacesFirstError(t *testing.T) {
	garbage := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: []byte("not valid DER")})

	_, err := Parse(garbage)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "no usable RSA public keys") {
		t.Fatalf("expected wrapped error, got %v", err)
	}
}

func TestParse_NoPemBlocks(t *testing.T) {
	_, err := Parse([]byte("this is not PEM"))
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "no PEM blocks found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParse_WrongBlockType(t *testing.T) {
	// EC PRIVATE KEY (or any unsupported type) should not pass.
	other := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: []byte("anything")})

	_, err := Parse(other)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestReadFile(t *testing.T) {
	k := mustGenKey(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "wolfi-signing.rsa.pub")
	if err := os.WriteFile(path, mustEncodePKIX(t, &k.PublicKey), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	keys, err := ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("got %d keys, want 1", len(keys))
	}
}

func TestReadFile_NotFound(t *testing.T) {
	_, err := ReadFile(filepath.Join(t.TempDir(), "does-not-exist"))
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}
