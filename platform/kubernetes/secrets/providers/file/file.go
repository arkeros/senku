package file

import (
	"context"
	"fmt"
	"net/url"
	"os"
)

// Provider reads a secret value from a file.
// URI: file:///path/to/secret
func Provider(_ context.Context, u *url.URL) ([]byte, error) {
	path := u.Path
	if path == "" {
		return nil, fmt.Errorf("file: missing path in URI %q", u)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read secret file: %v", err)
	}
	return data, nil
}
