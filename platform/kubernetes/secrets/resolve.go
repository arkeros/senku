package secrets

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"

	corev1 "k8s.io/api/core/v1"

	"github.com/arkeros/senku/base/json/jsonutil"
	"github.com/arkeros/senku/base/json/pointer"
)

// Provider resolves a parsed secret URL to secret bytes.
type Provider func(ctx context.Context, u *url.URL) ([]byte, error)

// Fetcher resolves a full secret URI (scheme://ref) to secret bytes.
type Fetcher func(ctx context.Context, uri string) ([]byte, error)

// NewFetcher builds a Fetcher that dispatches to the appropriate Provider
// based on the URI scheme.
//
// Transforms are extracted from the URI before dispatch:
//   - Query payload=base64: base64-decode the raw payload (ingress)
//   - Fragment (#/key): JSON Pointer (RFC 6901) field extraction
//   - Query decode=base64: base64-decode the result (egress)
//
// Processing order: payload → JSON Pointer → decode.
func NewFetcher(providers map[string]Provider) Fetcher {
	return func(ctx context.Context, uri string) ([]byte, error) {
		u, err := url.Parse(uri)
		if err != nil {
			return nil, fmt.Errorf("invalid secret URI %q: %w", uri, err)
		}
		if u.Scheme == "" {
			return nil, fmt.Errorf("invalid secret URI %q: missing scheme (expected scheme://ref)", uri)
		}
		p, ok := providers[u.Scheme]
		if !ok {
			return nil, fmt.Errorf("unknown secret provider scheme %q in URI %q", u.Scheme, uri)
		}

		// Extract transforms before dispatching to provider.
		fragment := u.Fragment
		payload := u.Query().Get("payload")
		decode := u.Query().Get("decode")

		// Validate transform values early.
		if payload != "" && payload != "base64" {
			return nil, fmt.Errorf("unsupported payload value %q in URI %q (supported: base64)", payload, uri)
		}
		if decode != "" && decode != "base64" {
			return nil, fmt.Errorf("unsupported decode value %q in URI %q (supported: base64)", decode, uri)
		}

		// Strip transforms from URL so providers don't see them.
		u.Fragment = ""
		u.RawFragment = ""
		q := u.Query()
		q.Del("payload")
		q.Del("decode")
		u.RawQuery = q.Encode()

		data, err := p(ctx, u)
		if err != nil {
			return nil, err
		}

		// 1. INGRESS: decode the raw payload.
		if payload == "base64" {
			decoded, err := base64.StdEncoding.DecodeString(string(data))
			if err != nil {
				return nil, fmt.Errorf("payload base64 decode in URI %q: %w", uri, err)
			}
			data = decoded
		}

		// 2. PROCESS: JSON Pointer extraction.
		if fragment != "" {
			ptr, err := pointer.Parse(fragment)
			if err != nil {
				return nil, fmt.Errorf("JSON Pointer in URI %q: %w", uri, err)
			}
			var parsed any
			if err := json.Unmarshal(data, &parsed); err != nil {
				return nil, fmt.Errorf("JSON Pointer %q in URI %q: unmarshal: %w", fragment, uri, err)
			}
			val, err := pointer.Resolve(parsed, ptr)
			if err != nil {
				return nil, fmt.Errorf("JSON Pointer %q in URI %q: %w", fragment, uri, err)
			}
			data, err = jsonutil.MarshalRaw(val)
			if err != nil {
				return nil, fmt.Errorf("JSON Pointer %q in URI %q: marshal: %w", fragment, uri, err)
			}
		}

		// 3. EGRESS: decode the extracted value.
		if decode == "base64" {
			decoded, err := base64.StdEncoding.DecodeString(string(data))
			if err != nil {
				return nil, fmt.Errorf("base64 decode in URI %q: %w", uri, err)
			}
			data = decoded
		}

		return data, nil
	}
}

// Resolve resolves secret URI references in a Kubernetes Secret.
//
// StringData values are treated as URIs and resolved directly.
// Every value must have a scheme; plain strings are rejected.
//
// Data values are base64-decoded. If the decoded value is a valid URI
// it is resolved and re-encoded to base64. Non-URI values are left unchanged.
func Resolve(ctx context.Context, secret *corev1.Secret, fetch Fetcher) error {
	if secret.Data == nil {
		secret.Data = make(map[string][]byte, len(secret.StringData))
	}
	for key, val := range secret.StringData {
		payload, err := fetch(ctx, val)
		if err != nil {
			return fmt.Errorf("stringData[%q]: %v", key, err)
		}
		secret.Data[key] = payload
	}
	secret.StringData = nil

	for key, val := range secret.Data {
		uri := string(val)
		u, err := url.Parse(uri)
		if err != nil || u.Scheme == "" {
			continue // not a URI, leave as-is
		}

		payload, err := fetch(ctx, uri)
		if err != nil {
			return fmt.Errorf("data[%q]: %v", key, err)
		}
		secret.Data[key] = payload
	}

	return nil
}
