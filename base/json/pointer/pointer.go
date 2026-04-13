// Package pointer implements JSON Pointer (RFC 6901) resolution.
package pointer

import (
	"fmt"
	"strconv"
	"strings"
)

// Pointer is a parsed JSON Pointer (RFC 6901) — a sequence of tokens.
type Pointer []Token

// New builds a Pointer from unescaped path segments.
//
//	pointer.New("nested", "str")       → /nested/str
//	pointer.New("a/b", "c~d")          → /a~1b/c~0d
func New(segments ...string) Pointer {
	p := make(Pointer, len(segments))
	for i, s := range segments {
		p[i] = Encode(s)
	}
	return p
}

// Parse parses a JSON Pointer string (e.g. "/foo/bar") into a Pointer.
// An empty string returns a nil Pointer (root document).
func Parse(s string) (Pointer, error) {
	if s == "" {
		return nil, nil
	}
	if !strings.HasPrefix(s, "/") {
		return nil, fmt.Errorf("invalid JSON Pointer %q: must start with /", s)
	}
	parts := strings.Split(s[1:], "/")
	p := make(Pointer, len(parts))
	for i, part := range parts {
		p[i] = Token(part)
	}
	return p, nil
}

// String returns the RFC 6901 string representation, e.g. "/foo/bar".
func (p Pointer) String() string {
	var b strings.Builder
	for _, t := range p {
		b.WriteByte('/')
		b.WriteString(string(t))
	}
	return b.String()
}

// Resolve resolves a Pointer against a pre-parsed JSON value,
// returning the value at the given path.
//
// A nil/empty pointer returns the root value unchanged.
func Resolve(parsed any, ptr Pointer) (any, error) {
	current := parsed
	for _, raw := range ptr {
		token := raw.String()

		switch node := current.(type) {
		case map[string]any:
			val, ok := node[token]
			if !ok {
				return nil, fmt.Errorf("key %q not found", token)
			}
			current = val
		case []any:
			index, err := strconv.Atoi(token)
			if err != nil || index < 0 || index >= len(node) {
				return nil, fmt.Errorf("invalid array index %q", token)
			}
			current = node[index]
		default:
			return nil, fmt.Errorf("cannot traverse scalar value at %q", token)
		}
	}

	return current, nil
}
