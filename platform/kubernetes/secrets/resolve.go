package secrets

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	corev1 "k8s.io/api/core/v1"

	"github.com/arkeros/senku/base/json/jsonutil"
	"github.com/arkeros/senku/base/json/pointer"
)

const spreadPrefix = "..."

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
// Keys prefixed with "..." trigger spread: the URI is fetched, parsed as a
// JSON object, and all top-level keys are merged into the Secret's data.
// Spread-vs-spread collisions are a hard error; explicit keys always win.
//
// Data values are inspected as raw bytes. If the value is a provider URI
// it is resolved. Non-URI values are left unchanged.
func Resolve(ctx context.Context, secret *corev1.Secret, fetch Fetcher) error {
	if secret.Data == nil {
		secret.Data = make(map[string][]byte, len(secret.StringData))
	}

	// Pass 1: process spread keys, build spread map.
	spreadData := make(map[string][]byte)
	spreadSource := make(map[string]string) // key → spread source for error messages
	for key, val := range secret.StringData {
		if !strings.HasPrefix(key, spreadPrefix) {
			continue
		}
		entries, err := spreadJSON(ctx, val, fetch)
		if err != nil {
			return fmt.Errorf("stringData[%q]: %v", key, err)
		}
		for k, v := range entries {
			if src, exists := spreadSource[k]; exists {
				return fmt.Errorf("spread collision: key %q produced by both %q and %q", k, src, key)
			}
			spreadData[k] = v
			spreadSource[k] = key
		}
	}

	// Apply spread data as the base layer.
	for k, v := range spreadData {
		secret.Data[k] = v
	}

	// Pass 2: process explicit (non-spread) keys; these override spread.
	for key, val := range secret.StringData {
		if strings.HasPrefix(key, spreadPrefix) {
			continue
		}
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

// spreadJSON fetches a URI, parses the result as a JSON object, and returns
// each top-level key as a separate entry.
func spreadJSON(ctx context.Context, uri string, fetch Fetcher) (map[string][]byte, error) {
	data, err := fetch(ctx, uri)
	if err != nil {
		return nil, err
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, fmt.Errorf("spread requires a JSON object, got: %w", err)
	}
	result := make(map[string][]byte, len(obj))
	for k, v := range obj {
		b, err := jsonutil.MarshalRaw(v)
		if err != nil {
			return nil, fmt.Errorf("spread key %q: %w", k, err)
		}
		result[k] = b
	}
	return result, nil
}
