package apkformat

import (
	"archive/tar"
	"bytes"
	"crypto"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"errors"
	"fmt"
	"hash"
	"io"
	"strings"
)

// SignatureSegment is the parsed first gzip stream of an .apk or
// APKINDEX.tar.gz. The signature filename names the hash algorithm:
//   .SIGN.RSA.<key>      → SHA1   (legacy apk-tools v2 default)
//   .SIGN.RSA256.<key>   → SHA256 (current apk-tools v2 default)
//   .SIGN.RSA512.<key>   → SHA512 (rare)
//
// The signature bytes are an RSA-PKCS#1-v1.5 signature over the hash
// of every byte AFTER the signature stream ends — i.e. the raw
// (compressed) bytes of all subsequent gzip streams.
type SignatureSegment struct {
	Filename string
	Hash     crypto.Hash
	Sig      []byte
}

// ReadSignatureSegment parses the signature tar (stream 0 of an apk
// file). Returns the parsed signature and an error if the segment is
// missing required fields or specifies an unsupported hash.
func ReadSignatureSegment(r io.Reader) (*SignatureSegment, error) {
	tr := tar.NewReader(r)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil, fmt.Errorf("signature segment carries no .SIGN.RSA* entry")
		}
		if err != nil {
			return nil, fmt.Errorf("read signature tar: %w", err)
		}
		// The signature filename is `.SIGN.RSA<hash>.<keyname>`. Anything
		// else (e.g. a stray .PKGINFO from a malformed apk) is ignored.
		hashFn, ok := hashFromSignFilename(hdr.Name)
		if !ok {
			continue
		}
		buf, err := io.ReadAll(tr)
		if err != nil {
			return nil, fmt.Errorf("read signature bytes: %w", err)
		}
		return &SignatureSegment{Filename: hdr.Name, Hash: hashFn, Sig: buf}, nil
	}
}

// hashFromSignFilename maps the .SIGN.RSA{,256,512}.<key> filename
// prefix to the crypto.Hash to use. Returns (_, false) for any other
// filename so caller treats it as a non-signature entry.
func hashFromSignFilename(name string) (crypto.Hash, bool) {
	clean := strings.TrimPrefix(name, "./")
	switch {
	case strings.HasPrefix(clean, ".SIGN.RSA256."):
		return crypto.SHA256, true
	case strings.HasPrefix(clean, ".SIGN.RSA512."):
		return crypto.SHA512, true
	case strings.HasPrefix(clean, ".SIGN.RSA."):
		return crypto.SHA1, true
	}
	return 0, false
}

// VerifySignature checks sig.Sig against the raw bytes of the
// remaining streams (signedBytes) using any key in trustRoot. Returns
// nil iff at least one key matches; any failure surfaces a non-nil
// error so the caller can refuse to proceed.
func VerifySignature(sig *SignatureSegment, signedBytes []byte, trustRoot []*rsa.PublicKey) error {
	if len(trustRoot) == 0 {
		return errors.New("no keys in trust root")
	}
	h := newHash(sig.Hash)
	if h == nil {
		return fmt.Errorf("unsupported hash %v", sig.Hash)
	}
	if _, err := h.Write(signedBytes); err != nil {
		return fmt.Errorf("hash signed bytes: %w", err)
	}
	digest := h.Sum(nil)
	var lastErr error
	for _, k := range trustRoot {
		if err := rsa.VerifyPKCS1v15(k, sig.Hash, digest, sig.Sig); err == nil {
			return nil
		} else {
			lastErr = err
		}
	}
	return fmt.Errorf("no trusted key verified signature: %w", lastErr)
}

func newHash(h crypto.Hash) hash.Hash {
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

// VerifyAPKINDEX consumes the full APKINDEX.tar.gz body, verifies the
// signature (if a trust root is supplied), and returns the
// uncompressed index-tar bytes ready for ParseAPKINDEXTar.
//
// trustRoot may be nil for one-off CLI use without verification; the
// caller is responsible for warning loud when that happens.
func VerifyAPKINDEX(body []byte, trustRoot []*rsa.PublicKey) ([]byte, error) {
	// stream 0 starts at offset 0; we need to know where it *ends* so
	// the "signed bytes" are precisely streams 1+. Read the signature
	// segment through a counting reader to capture the boundary. The
	// counting reader implements io.ByteReader, which prevents
	// gzip.NewReader from wrapping us in a buffered reader that
	// would over-read past the stream boundary.
	cr := &countingReader{R: bytes.NewReader(body)}
	sr := NewStreamReader(cr)

	sigStream, err := sr.Next()
	if err != nil {
		return nil, fmt.Errorf("read signature stream: %w", err)
	}
	sig, err := ReadSignatureSegment(sigStream)
	if err != nil {
		return nil, err
	}
	// Drain the rest of the signature stream and close it so the gzip
	// trailer is consumed and cr.N points exactly at the next
	// stream's first byte.
	if _, err := io.Copy(io.Discard, sigStream); err != nil {
		return nil, fmt.Errorf("drain signature stream: %w", err)
	}
	if err := sr.Close(); err != nil {
		return nil, fmt.Errorf("close signature stream: %w", err)
	}
	signedBytes := body[cr.N:]

	if trustRoot != nil {
		if err := VerifySignature(sig, signedBytes, trustRoot); err != nil {
			return nil, err
		}
	}

	rest := NewStreamReader(bytes.NewReader(signedBytes))
	indexStream, err := rest.Next()
	if err != nil {
		return nil, fmt.Errorf("read index stream: %w", err)
	}
	indexBytes, err := io.ReadAll(indexStream)
	if err != nil {
		return nil, fmt.Errorf("decompress index: %w", err)
	}
	return indexBytes, nil
}

// countingReader records the cumulative byte offset consumed from the
// underlying reader, so callers can locate the boundary between
// concatenated gzip streams.
//
// Implements io.ByteReader so gzip.NewReader doesn't wrap us in a
// 4 KB bufio.Reader. That wrap would over-read into the next stream
// and put N past the actual stream boundary, breaking the signed-
// bytes slice. The underlying reader (a *bytes.Reader from
// VerifyAPKINDEX) already supports byte-by-byte reads cheaply.
type countingReader struct {
	R io.Reader
	N int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.R.Read(p)
	c.N += int64(n)
	return n, err
}

func (c *countingReader) ReadByte() (byte, error) {
	if br, ok := c.R.(io.ByteReader); ok {
		b, err := br.ReadByte()
		if err == nil {
			c.N++
		}
		return b, err
	}
	var buf [1]byte
	n, err := c.R.Read(buf[:])
	if n > 0 {
		c.N++
		return buf[0], nil
	}
	if err == nil {
		err = io.EOF
	}
	return 0, err
}
