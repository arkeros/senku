package pointer

import (
	"encoding/json"
	"testing"
)

func parse(t *testing.T, data string) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(data), &v); err != nil {
		t.Fatalf("parse: %v", err)
	}
	return v
}

func mustParse(t *testing.T, s string) Pointer {
	t.Helper()
	p, err := Parse(s)
	if err != nil {
		t.Fatalf("Parse(%q): %v", s, err)
	}
	return p
}

func TestResolve_TopLevel(t *testing.T) {
	got, err := Resolve(parse(t, `{"password":"s3cret","user":"admin"}`), mustParse(t, "/password"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "s3cret" {
		t.Errorf("got %v, want %q", got, "s3cret")
	}
}

func TestResolve_Nested(t *testing.T) {
	got, err := Resolve(parse(t, `{"db":{"password":"s3cret","host":"localhost"}}`), mustParse(t, "/db/password"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "s3cret" {
		t.Errorf("got %v, want %q", got, "s3cret")
	}
}

func TestResolve_MissingKey(t *testing.T) {
	_, err := Resolve(parse(t, `{"password":"s3cret"}`), mustParse(t, "/missing"))
	if err == nil {
		t.Fatal("expected error for missing key")
	}
}

func TestResolve_EscapeSlash(t *testing.T) {
	got, err := Resolve(parse(t, `{"a/b":"slash"}`), mustParse(t, "/a~1b"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "slash" {
		t.Errorf("got %v, want %q", got, "slash")
	}
}

func TestResolve_EscapeTilde(t *testing.T) {
	got, err := Resolve(parse(t, `{"c~d":"tilde"}`), mustParse(t, "/c~0d"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "tilde" {
		t.Errorf("got %v, want %q", got, "tilde")
	}
}

func TestResolve_Number(t *testing.T) {
	got, err := Resolve(parse(t, `{"count":42}`), mustParse(t, "/count"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != float64(42) {
		t.Errorf("got %v, want %v", got, 42)
	}
}

func TestResolve_Object(t *testing.T) {
	got, err := Resolve(parse(t, `{"nested":{"a":1}}`), mustParse(t, "/nested"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := got.(map[string]any)
	if !ok {
		t.Fatalf("got %T, want map[string]any", got)
	}
	if m["a"] != float64(1) {
		t.Errorf("got %v, want 1", m["a"])
	}
}

func TestResolve_NotObject(t *testing.T) {
	_, err := Resolve(parse(t, `{"a":"string"}`), mustParse(t, "/a/nested"))
	if err == nil {
		t.Fatal("expected error when traversing non-object")
	}
}

func TestResolve_Array(t *testing.T) {
	got, err := Resolve(parse(t, `{"users":["alice","bob"]}`), mustParse(t, "/users/1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "bob" {
		t.Errorf("got %v, want %q", got, "bob")
	}
}

func TestResolve_ArrayInvalidIndex(t *testing.T) {
	_, err := Resolve(parse(t, `{"users":["alice","bob"]}`), mustParse(t, "/users/5"))
	if err == nil {
		t.Fatal("expected error for out-of-bounds array index")
	}
}

func TestResolve_ArrayNonNumericIndex(t *testing.T) {
	_, err := Resolve(parse(t, `{"users":["alice","bob"]}`), mustParse(t, "/users/name"))
	if err == nil {
		t.Fatal("expected error for non-numeric array index")
	}
}

func TestResolve_EmptyPointer(t *testing.T) {
	got, err := Resolve(parse(t, `{"a":1}`), mustParse(t, ""))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := got.(map[string]any)
	if !ok {
		t.Fatalf("got %T, want map[string]any", got)
	}
	if m["a"] != float64(1) {
		t.Errorf("got %v, want 1", m["a"])
	}
}

func TestParse_InvalidPointer(t *testing.T) {
	_, err := Parse("no-leading-slash")
	if err == nil {
		t.Fatal("expected error for invalid pointer")
	}
}

// --- Token / Encode / New ---

func TestToken_String(t *testing.T) {
	tests := []struct {
		encoded Token
		want    string
	}{
		{"password", "password"},
		{"a~1b", "a/b"},
		{"c~0d", "c~d"},
		{"~0~1", "~/"},
	}
	for _, tt := range tests {
		if got := tt.encoded.String(); got != tt.want {
			t.Errorf("Token(%q).String() = %q, want %q", tt.encoded, got, tt.want)
		}
	}
}

func TestEncode(t *testing.T) {
	tests := []struct {
		value string
		want  Token
	}{
		{"password", "password"},
		{"a/b", "a~1b"},
		{"c~d", "c~0d"},
		{"~/", "~0~1"},
	}
	for _, tt := range tests {
		if got := Encode(tt.value); got != tt.want {
			t.Errorf("Encode(%q) = %q, want %q", tt.value, got, tt.want)
		}
	}
}

func TestNew(t *testing.T) {
	tests := []struct {
		segments []string
		want     string
	}{
		{[]string{"password"}, "/password"},
		{[]string{"nested", "str"}, "/nested/str"},
		{[]string{"a/b", "c~d"}, "/a~1b/c~0d"},
		{[]string{}, ""},
	}
	for _, tt := range tests {
		if got := New(tt.segments...).String(); got != tt.want {
			t.Errorf("New(%v) = %q, want %q", tt.segments, got, tt.want)
		}
	}
}

func TestNew_RoundTrip(t *testing.T) {
	parsed := map[string]any{
		"a/b": map[string]any{
			"c~d": "found",
		},
	}
	ptr := New("a/b", "c~d")
	got, err := Resolve(parsed, ptr)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "found" {
		t.Errorf("got %v, want %q", got, "found")
	}
}

func TestResolve_PreParsed(t *testing.T) {
	parsed := map[string]any{
		"db": map[string]any{
			"host": "localhost",
			"port": float64(5432),
		},
	}
	got, err := Resolve(parsed, mustParse(t, "/db/host"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "localhost" {
		t.Errorf("got %v, want %q", got, "localhost")
	}
}
