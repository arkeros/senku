// Package mem provides an in-memory secret provider for testing.
package mem

import (
	"context"
	"fmt"
	"net/url"
)

// Provider returns a Provider that looks up secrets from the given map.
// URI: mem://key
func Provider(secrets map[string]string) func(context.Context, *url.URL) ([]byte, error) {
	return func(_ context.Context, u *url.URL) ([]byte, error) {
		key := u.Host
		if key == "" {
			key = u.Opaque
		}
		val, ok := secrets[key]
		if !ok {
			return nil, fmt.Errorf("secret %q not found", key)
		}
		return []byte(val), nil
	}
}
