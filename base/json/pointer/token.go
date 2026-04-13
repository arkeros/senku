package pointer

import "strings"

// Token is an encoded JSON Pointer token (a single path segment).
type Token string

// String returns the decoded token value.
// RFC 6901: ~1 → /, ~0 → ~ (order matters).
func (t Token) String() string {
	return strings.ReplaceAll(strings.ReplaceAll(string(t), "~1", "/"), "~0", "~")
}

// Encode returns a Token with the value properly escaped for use in a JSON Pointer.
// RFC 6901: ~ → ~0, / → ~1 (order matters).
func Encode(value string) Token {
	return Token(strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1"))
}
