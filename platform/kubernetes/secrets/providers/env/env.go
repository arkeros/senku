package env

import (
	"context"
	"fmt"
	"net/url"
	"os"
)

// Provider reads a secret value from an environment variable.
// URI: env://VAR_NAME  (variable name is the host component)
// URI: env:VAR_NAME    (opaque form also works)
func Provider(_ context.Context, u *url.URL) ([]byte, error) {
	name := u.Host
	if name == "" {
		name = u.Opaque
	}
	if name == "" {
		return nil, fmt.Errorf("env: missing variable name in URI %q", u)
	}
	val, ok := os.LookupEnv(name)
	if !ok {
		return nil, fmt.Errorf("environment variable %q not set", name)
	}
	return []byte(val), nil
}
