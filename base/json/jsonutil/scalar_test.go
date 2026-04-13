package jsonutil

import (
	"testing"
)

func TestMarshalRaw_String(t *testing.T) {
	got, err := MarshalRaw("hello")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != "hello" {
		t.Errorf("got %q, want %q", got, "hello")
	}
}

func TestMarshalRaw_Number(t *testing.T) {
	got, err := MarshalRaw(float64(42))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != "42" {
		t.Errorf("got %q, want %q", got, "42")
	}
}

func TestMarshalRaw_Bool(t *testing.T) {
	got, err := MarshalRaw(true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != "true" {
		t.Errorf("got %q, want %q", got, "true")
	}
}

func TestMarshalRaw_Object(t *testing.T) {
	got, err := MarshalRaw(map[string]any{"a": float64(1)})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != `{"a":1}` {
		t.Errorf("got %q, want %q", got, `{"a":1}`)
	}
}

func TestMarshalRaw_Array(t *testing.T) {
	got, err := MarshalRaw([]any{"x", "y"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != `["x","y"]` {
		t.Errorf("got %q, want %q", got, `["x","y"]`)
	}
}

func TestMarshalRaw_Nil(t *testing.T) {
	got, err := MarshalRaw(nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != "null" {
		t.Errorf("got %q, want %q", got, "null")
	}
}
