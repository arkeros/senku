// Package apkformat parses APK-ecosystem file formats: concatenated gzip
// streams, APKINDEX text records, and .PKGINFO key-value blocks.
//
// File-format primer (apk-tools v2 layout):
//
//	An .apk file is the concatenation of three independent gzip streams:
//	  stream 0  signature  tar containing one entry .SIGN.RSA{,256,512}.<keyname>
//	  stream 1  control    tar containing .PKGINFO and optional scripts
//	  stream 2  data       tar of installed file content
//
//	An APKINDEX.tar.gz is two streams:
//	  stream 0  signature  tar containing .SIGN.RSA{,256,512}.<keyname>
//	  stream 1  index      tar containing APKINDEX (and DESCRIPTION)
//
// The signature segment's filename suffix (.SIGN.RSA / .SIGN.RSA256 /
// .SIGN.RSA512) names the hash: SHA1, SHA256, or SHA512 — applied to
// every byte AFTER the signature segment ends. The result is then
// RSA-PKCS#1-v1.5 signed by the publisher's key.
package apkformat

import (
	"compress/gzip"
	"fmt"
	"io"
)

// StreamReader walks a sequence of concatenated gzip streams. After
// each Next() call, ReadAll/Read returns the uncompressed bytes of one
// stream; subsequent Next() advances to the next stream.
//
// The underlying io.Reader must also implement io.ByteReader (a
// *bufio.Reader from the caller is the natural fit) so the gzip
// reader can stop at the stream boundary without overconsuming.
type StreamReader struct {
	src    io.Reader
	current *gzip.Reader
}

// NewStreamReader wraps src. The caller retains ownership of src.
func NewStreamReader(src io.Reader) *StreamReader {
	return &StreamReader{src: src}
}

// Next advances to the next gzip stream. Returns io.EOF when no more
// streams remain. The returned reader is valid until the next call to
// Next() — it shares the underlying source.
func (s *StreamReader) Next() (io.Reader, error) {
	if s.current != nil {
		// Drain any remaining bytes from the current stream so the
		// underlying reader is positioned at the next gzip header.
		if _, err := io.Copy(io.Discard, s.current); err != nil {
			return nil, fmt.Errorf("drain previous stream: %w", err)
		}
		if err := s.current.Close(); err != nil {
			return nil, fmt.Errorf("close previous stream: %w", err)
		}
		s.current = nil
	}

	gz, err := gzip.NewReader(s.src)
	if err != nil {
		// io.EOF surfaces verbatim so callers can detect end-of-streams.
		return nil, err
	}
	// Multistream(false) makes gzip stop at the first stream's end
	// rather than auto-advancing past it, which is what we want when
	// the streams carry independent tars.
	gz.Multistream(false)
	s.current = gz
	return gz, nil
}

// Close releases the current stream. Calling Close before reading all
// streams is fine — the caller may not need every one.
func (s *StreamReader) Close() error {
	if s.current == nil {
		return nil
	}
	err := s.current.Close()
	s.current = nil
	return err
}
