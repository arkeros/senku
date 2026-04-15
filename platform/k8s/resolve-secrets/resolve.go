package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	corev1 "k8s.io/api/core/v1"

	"github.com/arkeros/senku/base/json/jsonutil"
	"github.com/arkeros/senku/platform/secrets"
)

const spreadPrefix = "..."

// resolveSecret resolves secret URI references in a Kubernetes Secret.
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
func resolveSecret(ctx context.Context, secret *corev1.Secret, fetch secrets.Fetcher) error {
	if secret.Data == nil {
		secret.Data = make(map[string][]byte, len(secret.StringData))
	}

	// Snapshot original Data keys so Pass 3 only processes pre-existing
	// entries, not values written by spread/StringData resolution.
	originalDataKeys := make(map[string]struct{}, len(secret.Data))
	for k := range secret.Data {
		originalDataKeys[k] = struct{}{}
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

	// Track keys written by spread and StringData so Pass 3 skips them.
	resolvedKeys := make(map[string]struct{}, len(spreadData)+len(secret.StringData))

	// Apply spread data as the base layer.
	for k, v := range spreadData {
		secret.Data[k] = v
		resolvedKeys[k] = struct{}{}
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
		resolvedKeys[key] = struct{}{}
	}
	secret.StringData = nil

	// Pass 3: resolve URIs in pre-existing Data entries only.
	// Skip keys already written by StringData or spread to avoid double-resolution.
	for key := range originalDataKeys {
		if _, ok := resolvedKeys[key]; ok {
			continue
		}
		val := secret.Data[key]
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
func spreadJSON(ctx context.Context, uri string, fetch secrets.Fetcher) (map[string][]byte, error) {
	data, err := fetch(ctx, uri)
	if err != nil {
		return nil, err
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, fmt.Errorf("spread requires a JSON object, got: %v", err)
	}
	result := make(map[string][]byte, len(obj))
	for k, v := range obj {
		b, err := jsonutil.MarshalRaw(v)
		if err != nil {
			return nil, fmt.Errorf("spread key %q: %v", k, err)
		}
		result[k] = b
	}
	return result, nil
}
