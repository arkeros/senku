package apkformat

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"io"
	"testing"
)

func gzipStream(t *testing.T, payload []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(payload); err != nil {
		t.Fatalf("gz write: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gz close: %v", err)
	}
	return buf.Bytes()
}

func TestStreamReader_WalksMultipleConcatenatedStreams(t *testing.T) {
	a := gzipStream(t, []byte("alpha"))
	b := gzipStream(t, []byte("beta"))
	c := gzipStream(t, []byte("gamma"))
	all := bytes.NewReader(append(append(a, b...), c...))

	sr := NewStreamReader(bufio.NewReader(all))

	var got []string
	for {
		r, err := sr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("Next: %v", err)
		}
		body, err := io.ReadAll(r)
		if err != nil {
			t.Fatalf("ReadAll: %v", err)
		}
		got = append(got, string(body))
	}

	want := []string{"alpha", "beta", "gamma"}
	if len(got) != len(want) {
		t.Fatalf("got %d streams, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("stream %d: got %q, want %q", i, got[i], want[i])
		}
	}
}

func TestStreamReader_AdvancingWithoutReadingDrainsCurrent(t *testing.T) {
	// Caller may not care about stream 0 (signature segment) and
	// jump straight to stream 1 (control). Next() must drain the
	// skipped stream so the underlying reader is positioned at the
	// next gzip header.
	a := gzipStream(t, []byte("signature-bytes"))
	b := gzipStream(t, []byte("control-bytes"))
	all := bytes.NewReader(append(a, b...))

	sr := NewStreamReader(bufio.NewReader(all))

	if _, err := sr.Next(); err != nil {
		t.Fatalf("first Next: %v", err)
	}
	// Skip reading from stream 0; advance directly.
	r, err := sr.Next()
	if err != nil {
		t.Fatalf("second Next: %v", err)
	}
	body, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if string(body) != "control-bytes" {
		t.Fatalf("got %q, want %q", body, "control-bytes")
	}
}

func TestStreamReader_EmptyInput_ReturnsEOF(t *testing.T) {
	sr := NewStreamReader(bufio.NewReader(bytes.NewReader(nil)))
	_, err := sr.Next()
	if err != io.EOF {
		t.Fatalf("got %v, want EOF", err)
	}
}
