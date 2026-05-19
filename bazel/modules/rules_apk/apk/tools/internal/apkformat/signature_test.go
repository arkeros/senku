package apkformat

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"hash"
	"testing"
)

func tarSingleFile(t *testing.T, name string, body []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body))}); err != nil {
		t.Fatalf("tar header: %v", err)
	}
	if _, err := tw.Write(body); err != nil {
		t.Fatalf("tar write: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	return buf.Bytes()
}

func sigTar(t *testing.T, filename string, sigBytes []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	if err := tw.WriteHeader(&tar.Header{Name: filename, Mode: 0o644, Size: int64(len(sigBytes))}); err != nil {
		t.Fatalf("tar header: %v", err)
	}
	if _, err := tw.Write(sigBytes); err != nil {
		t.Fatalf("tar write: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	return buf.Bytes()
}

func gzipBytes(t *testing.T, payload []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(payload); err != nil {
		t.Fatalf("gz write: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gz close: %v", err)
	}
	return buf.Bytes()
}

func hashAlgo(h crypto.Hash) hash.Hash {
	switch h {
	case crypto.SHA1:
		return sha1.New()
	case crypto.SHA256:
		return sha256.New()
	case crypto.SHA512:
		return sha512.New()
	}
	return nil
}

// makeSignedAPKINDEX returns a synthetic APKINDEX.tar.gz: gzip(sigTar) || gzip(indexTar)
// where sigTar contains .SIGN.RSA<hashSuffix>.<keyname> with an RSA-PKCS1v15
// signature over the gzipped indexTar bytes.
func makeSignedAPKINDEX(t *testing.T, key *rsa.PrivateKey, h crypto.Hash, indexBody []byte) (apkindexBytes []byte) {
	t.Helper()

	indexTar := tarSingleFile(t, "APKINDEX", indexBody)
	gzIndex := gzipBytes(t, indexTar)

	// Compute the signature over the *compressed* bytes of the index stream.
	hh := hashAlgo(h)
	if _, err := hh.Write(gzIndex); err != nil {
		t.Fatalf("hash: %v", err)
	}
	digest := hh.Sum(nil)
	sigBytes, err := rsa.SignPKCS1v15(rand.Reader, key, h, digest)
	if err != nil {
		t.Fatalf("SignPKCS1v15: %v", err)
	}

	var sigFilename string
	switch h {
	case crypto.SHA1:
		sigFilename = ".SIGN.RSA.wolfi-signing.rsa.pub"
	case crypto.SHA256:
		sigFilename = ".SIGN.RSA256.wolfi-signing.rsa.pub"
	case crypto.SHA512:
		sigFilename = ".SIGN.RSA512.wolfi-signing.rsa.pub"
	}
	sigT := sigTar(t, sigFilename, sigBytes)
	gzSig := gzipBytes(t, sigT)

	return append(gzSig, gzIndex...)
}

func TestReadSignatureSegment_ParsesSHA256Marker(t *testing.T) {
	body := sigTar(t, ".SIGN.RSA256.wolfi-signing.rsa.pub", []byte("signature-bytes"))
	sig, err := ReadSignatureSegment(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("ReadSignatureSegment: %v", err)
	}
	if sig.Hash != crypto.SHA256 {
		t.Errorf("Hash = %v, want SHA256", sig.Hash)
	}
	if string(sig.Sig) != "signature-bytes" {
		t.Errorf("Sig = %q", sig.Sig)
	}
}

func TestReadSignatureSegment_ParsesSHA1Marker(t *testing.T) {
	body := sigTar(t, ".SIGN.RSA.wolfi-signing.rsa.pub", []byte("sig"))
	sig, err := ReadSignatureSegment(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("ReadSignatureSegment: %v", err)
	}
	if sig.Hash != crypto.SHA1 {
		t.Errorf("Hash = %v, want SHA1", sig.Hash)
	}
}

func TestVerifyAPKINDEX_ValidSignature(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	indexBody := []byte("P:foo\nV:1-r0\nA:x86_64\n\n")
	apkindex := makeSignedAPKINDEX(t, key, crypto.SHA256, indexBody)

	gotIndexTar, err := VerifyAPKINDEX(apkindex, []*rsa.PublicKey{&key.PublicKey})
	if err != nil {
		t.Fatalf("VerifyAPKINDEX: %v", err)
	}
	// Sanity-check that the returned bytes are the original index tar
	// (i.e. signature stream stripped, decompressed, and the inner
	// tar passes through). Full APKINDEX parsing is exercised by the
	// pin tool's tests via apk.ParsePackageIndex.
	tr := tar.NewReader(bytes.NewReader(gotIndexTar))
	hdr, err := tr.Next()
	if err != nil {
		t.Fatalf("read index tar: %v", err)
	}
	if hdr.Name != "APKINDEX" {
		t.Errorf("first tar entry = %q, want APKINDEX", hdr.Name)
	}
}

func TestVerifyAPKINDEX_TamperedPayloadFails(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	apkindex := makeSignedAPKINDEX(t, key, crypto.SHA256, []byte("P:foo\nV:1-r0\nA:x86_64\n\n"))
	// Flip a byte in the signed region (= after the signature stream).
	// Find the boundary by re-reading the signature stream length.
	cr := &countingReader{R: bytes.NewReader(apkindex)}
	sr := NewStreamReader(bufio.NewReader(cr))
	if _, err := sr.Next(); err != nil {
		t.Fatalf("Next: %v", err)
	}
	// Drain to advance cr.N to the end of stream 0.
	stream0, _ := sr.Next()
	if stream0 != nil {
		// no-op: just ensures stream 0 is fully read
	}
	// Tamper: flip the last byte of the gzipped payload (still inside
	// the trailer of the index gzip stream — corruption either way).
	apkindex[len(apkindex)-1] ^= 0xff

	_, err = VerifyAPKINDEX(apkindex, []*rsa.PublicKey{&key.PublicKey})
	if err == nil {
		t.Fatal("expected error on tampered payload, got nil")
	}
}

func TestVerifyAPKINDEX_WrongKeyFails(t *testing.T) {
	signing, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	apkindex := makeSignedAPKINDEX(t, signing, crypto.SHA256, []byte("P:foo\nV:1-r0\nA:x86_64\n\n"))

	_, err = VerifyAPKINDEX(apkindex, []*rsa.PublicKey{&other.PublicKey})
	if err == nil {
		t.Fatal("expected error when verifying with wrong key, got nil")
	}
}

func TestVerifyAPKINDEX_NilTrustRoot_SkipsVerification(t *testing.T) {
	// Build an APKINDEX with a bogus signature (we won't have a private key
	// matching the .SIGN.RSA256 bytes), then verify with nil trustRoot.
	// Should still return the index bytes.
	body := tarSingleFile(t, "APKINDEX", []byte("P:foo\nV:1-r0\nA:noarch\n\n"))
	gzIndex := gzipBytes(t, body)
	gzSig := gzipBytes(t, sigTar(t, ".SIGN.RSA256.wolfi-signing.rsa.pub", []byte("not-a-real-signature")))

	got, err := VerifyAPKINDEX(append(gzSig, gzIndex...), nil)
	if err != nil {
		t.Fatalf("VerifyAPKINDEX(nil trustRoot): %v", err)
	}
	if !bytes.Equal(got, body) {
		t.Errorf("returned index tar does not match input")
	}
}
