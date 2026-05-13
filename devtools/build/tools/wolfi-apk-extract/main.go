// Command wolfi-apk-extract extracts an allow-listed subset of paths from a
// Wolfi/Alpine `.apk` package into a deterministic tar.
//
// A `.apk` is three concatenated gzip-tar streams (signature, control, data).
// Each segment ends in a tar end-of-archive marker, so a naive single-pass
// tar reader stops at the first segment and never sees the data files. This
// tool walks each gzip stream in turn and reads each inner tar independently,
// then re-emits the kept entries with canonical uid/gid/mtime so the output
// is byte-stable across hosts.
//
// Hidden files (`.PKGINFO`, `.melange.yaml`, `.SIGN.*`, scriptlets) and apk
// bookkeeping (`var/lib/db/sbom/...`, `var/lib/apk/...`) are always dropped
// regardless of --keep. --keep is an explicit allow-list of path prefixes;
// at least one is required.
//
// Usage:
//
//	wolfi-apk-extract --in <apk> --out <tar> --keep <path> [--keep <path>]...
package main

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"
)

type stringSlice []string

func (s *stringSlice) String() string     { return strings.Join(*s, ",") }
func (s *stringSlice) Set(v string) error { *s = append(*s, v); return nil }

type entry struct {
	hdr  *tar.Header
	body []byte
}

func keep(name string, allow []string) bool {
	clean := strings.TrimPrefix(name, "./")
	clean = strings.TrimRight(clean, "/")
	if clean == "" {
		return false
	}
	// Always drop apk metadata. The base name check covers signature segment
	// entries like `.SIGN.RSA.<key>`, melange's `.PKGINFO` / `.melange.yaml`,
	// and scriptlets (`.trigger`, `.post-install`, ...).
	parts := strings.Split(clean, "/")
	for _, p := range parts {
		if strings.HasPrefix(p, ".") {
			return false
		}
	}
	if strings.HasPrefix(clean, "var/lib/db/sbom/") || strings.HasPrefix(clean, "var/lib/apk/") {
		return false
	}
	for _, prefix := range allow {
		prefix = strings.TrimRight(prefix, "/")
		if clean == prefix || strings.HasPrefix(clean, prefix+"/") {
			return true
		}
	}
	return false
}

func extract(r io.Reader, allow []string) ([]entry, error) {
	br := bufio.NewReader(r)
	var out []entry
	for {
		gz, err := gzip.NewReader(br)
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("gzip reader: %w", err)
		}
		gz.Multistream(false)
		tr := tar.NewReader(gz)
		for {
			hdr, err := tr.Next()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				return nil, fmt.Errorf("tar next: %w", err)
			}
			if !keep(hdr.Name, allow) {
				continue
			}
			var body []byte
			if hdr.Typeflag == tar.TypeReg {
				body, err = io.ReadAll(tr)
				if err != nil {
					return nil, fmt.Errorf("read body %q: %w", hdr.Name, err)
				}
			}
			out = append(out, entry{hdr: hdr, body: body})
		}
		if _, err := io.Copy(io.Discard, gz); err != nil {
			return nil, fmt.Errorf("drain stream: %w", err)
		}
		if err := gz.Close(); err != nil {
			return nil, fmt.Errorf("gzip close: %w", err)
		}
	}
	return out, nil
}

func writeTar(w io.Writer, entries []entry) error {
	sort.Slice(entries, func(i, j int) bool { return entries[i].hdr.Name < entries[j].hdr.Name })
	tw := tar.NewWriter(w)
	zero := time.Unix(0, 0).UTC()
	for _, e := range entries {
		h := *e.hdr
		h.Uid = 0
		h.Gid = 0
		h.Uname = ""
		h.Gname = ""
		h.ModTime = zero
		h.AccessTime = time.Time{}
		h.ChangeTime = time.Time{}
		// Wolfi .apks carry PAX records (notably ATIME/CTIME); strip them
		// so the output is canonical USTAR without secondary headers.
		h.PAXRecords = nil
		h.Xattrs = nil //nolint:staticcheck // SA1019: stdlib type still exposes the field.
		h.Format = tar.FormatUSTAR
		if h.Typeflag != tar.TypeReg {
			h.Size = 0
		}
		if err := tw.WriteHeader(&h); err != nil {
			return fmt.Errorf("write header %q: %w", h.Name, err)
		}
		if len(e.body) > 0 {
			if _, err := tw.Write(e.body); err != nil {
				return fmt.Errorf("write body %q: %w", h.Name, err)
			}
		}
	}
	return tw.Close()
}

func run(in, out string, allow []string) error {
	if len(allow) == 0 {
		return errors.New("--keep is required (at least one path prefix)")
	}
	f, err := os.Open(in)
	if err != nil {
		return fmt.Errorf("open input: %w", err)
	}
	defer f.Close()

	entries, err := extract(f, allow)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return fmt.Errorf("no entries matched --keep %v", allow)
	}

	o, err := os.Create(out)
	if err != nil {
		return fmt.Errorf("create output: %w", err)
	}
	defer o.Close()
	return writeTar(o, entries)
}

func main() {
	in := flag.String("in", "", "input .apk path")
	out := flag.String("out", "", "output .tar path")
	var allow stringSlice
	flag.Var(&allow, "keep", "path prefix to include (repeatable); at least one required")
	flag.Parse()

	if *in == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "usage: wolfi-apk-extract --in <apk> --out <tar> --keep <path>...")
		os.Exit(2)
	}
	if err := run(*in, *out, allow); err != nil {
		fmt.Fprintf(os.Stderr, "wolfi-apk-extract: %v\n", err)
		os.Exit(1)
	}
}
