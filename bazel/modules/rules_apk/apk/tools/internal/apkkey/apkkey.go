// Package apkkey decodes PEM-encoded RSA public keys used to sign APK
// repositories and APK package files.
//
// APK signing key shape: a single PEM block of type "PUBLIC KEY"
// (PKIX-encoded SubjectPublicKeyInfo wrapping an rsa.PublicKey). Wolfi's
// `wolfi-signing.rsa.pub` and Alpine's `alpine-devel@*.rsa.pub` files
// both follow this shape. A trust-root file may concatenate multiple
// PEM blocks for key rotation; each is parsed independently and the
// first parseable union into one trust root.
//
// Unparseable blocks are skipped (not all-blocks-failed): vendor
// keyrings sometimes ship rotation/legacy variants alongside the
// current key. Downstream signature verification fails cleanly if none
// of the parseable keys matches the signature being checked.
package apkkey

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
)

// ReadFile parses every PEM "PUBLIC KEY" block in the file at path and
// returns them as a flat list of *rsa.PublicKey trust-root entries.
//
// At least one block must parse to *rsa.PublicKey. If all blocks fail
// to parse, the error from the first failure is surfaced so a real
// regression isn't masked by other-block tolerance.
func ReadFile(path string) ([]*rsa.PublicKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return Parse(data)
}

// Parse accepts the raw PEM-bundle bytes and returns every *rsa.PublicKey
// it can decode.
func Parse(data []byte) ([]*rsa.PublicKey, error) {
	var keys []*rsa.PublicKey
	var firstErr error
	rest := data
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			break
		}
		// Two on-disk shapes appear in practice for RSA pubkeys:
		// "PUBLIC KEY" → PKIX SubjectPublicKeyInfo (the modern shape,
		// what wolfi-signing.rsa.pub ships) and "RSA PUBLIC KEY" →
		// PKCS#1 (legacy, what `openssl rsa -pubout -RSAPublicKey_out`
		// would emit). Accept both; reject anything else.
		var pub any
		var perr error
		switch block.Type {
		case "PUBLIC KEY":
			pub, perr = x509.ParsePKIXPublicKey(block.Bytes)
		case "RSA PUBLIC KEY":
			pub, perr = x509.ParsePKCS1PublicKey(block.Bytes)
		default:
			perr = fmt.Errorf("unsupported PEM block type %q", block.Type)
		}
		if perr != nil {
			if firstErr == nil {
				firstErr = perr
			}
			continue
		}
		rsaKey, ok := pub.(*rsa.PublicKey)
		if !ok {
			if firstErr == nil {
				firstErr = fmt.Errorf("PEM block does not contain an RSA public key (got %T)", pub)
			}
			continue
		}
		keys = append(keys, rsaKey)
	}
	if len(keys) == 0 {
		if firstErr != nil {
			return nil, fmt.Errorf("no usable RSA public keys: %w", firstErr)
		}
		return nil, fmt.Errorf("no PEM blocks found")
	}
	return keys, nil
}
