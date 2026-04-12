package secrets

import (
	"context"
	"fmt"
	"net/url"

	corev1 "k8s.io/api/core/v1"
)

// Provider resolves a parsed secret URL to secret bytes.
type Provider func(ctx context.Context, u *url.URL) ([]byte, error)

// Fetcher resolves a full secret URI (scheme://ref) to secret bytes.
type Fetcher func(ctx context.Context, uri string) ([]byte, error)

// NewFetcher builds a Fetcher that dispatches to the appropriate Provider
// based on the URI scheme.
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
		return p(ctx, u)
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
