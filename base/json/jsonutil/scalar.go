// Package jsonutil provides generic JSON helpers.
package jsonutil

import "encoding/json"

// MarshalRaw returns the raw byte representation of a value.
// Strings are returned without JSON quotes; all other types
// are marshaled as standard JSON.
func MarshalRaw(v any) ([]byte, error) {
	if s, ok := v.(string); ok {
		return []byte(s), nil
	}
	return json.Marshal(v)
}
