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
// When --installed-db-at <path> is set, the `.PKGINFO` from the apk's control
// segment is transformed into a single-package `/lib/apk/db/installed`-style
// record and inserted at <path>, with parent directory entries synthesised
// so syft's stereoscope image indexer sees the file. Senku ships at
// `usr/lib/apk/db/installed` because senku images merge-usr to /usr/lib (/lib
// is a symlink), matching the on-disk layout of Wolfi/Chainguard base images.
//
// Usage:
//
//	wolfi-apk-extract --in <apk> --out <tar> --keep <path> [--keep <path>]...
//	                  [--installed-db-at <tar-path>]
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
	"path"
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

// extract walks every gzip-tar stream in r, returns entries matching one of
// the --keep prefixes (post hidden/bookkeeping filter), and separately the
// raw bytes of `.PKGINFO` if it appeared in any segment (used by the
// installed-db synthesiser; not included in the returned entries).
func extract(r io.Reader, allow []string) ([]entry, []byte, error) {
	br := bufio.NewReader(r)
	var out []entry
	var pkginfo []byte
	for {
		gz, err := gzip.NewReader(br)
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, nil, fmt.Errorf("gzip reader: %w", err)
		}
		gz.Multistream(false)
		tr := tar.NewReader(gz)
		for {
			hdr, err := tr.Next()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				return nil, nil, fmt.Errorf("tar next: %w", err)
			}
			clean := strings.TrimPrefix(hdr.Name, "./")
			if clean == ".PKGINFO" && hdr.Typeflag == tar.TypeReg {
				body, err := io.ReadAll(tr)
				if err != nil {
					return nil, nil, fmt.Errorf("read .PKGINFO: %w", err)
				}
				pkginfo = body
				continue
			}
			if !keep(hdr.Name, allow) {
				continue
			}
			var body []byte
			if hdr.Typeflag == tar.TypeReg {
				body, err = io.ReadAll(tr)
				if err != nil {
					return nil, nil, fmt.Errorf("read body %q: %w", hdr.Name, err)
				}
			}
			out = append(out, entry{hdr: hdr, body: body})
		}
		if _, err := io.Copy(io.Discard, gz); err != nil {
			return nil, nil, fmt.Errorf("drain stream: %w", err)
		}
		if err := gz.Close(); err != nil {
			return nil, nil, fmt.Errorf("gzip close: %w", err)
		}
	}
	return out, pkginfo, nil
}

// pkginfoToInstalledDB transforms a `.PKGINFO` body into the single-package
// `/lib/apk/db/installed`-style record that syft's apk cataloger parses.
// Output field order matches the canonical layout shipped by Wolfi's
// apk-tools (P V A L T o m U D p c i t I k), trailing blank line included
// so concatenation with additional packages stays well-formed.
//
// Field set is deliberately minimal — file lists (F/R/Z/a) and control-segment
// checksum (C) are omitted; both are optional for cataloger detection and
// emitting them faithfully requires hashing the apk's tar entries.
// Re-add if syft's stereoscope path-attribution ever needs F/R coverage.
func pkginfoToInstalledDB(pkginfo []byte) ([]byte, error) {
	fields := map[string][]string{}
	for _, line := range strings.Split(string(pkginfo), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.Index(line, "=")
		if eq < 0 {
			continue
		}
		k := strings.TrimSpace(line[:eq])
		v := strings.TrimSpace(line[eq+1:])
		fields[k] = append(fields[k], v)
	}
	one := func(k string) string {
		if vs, ok := fields[k]; ok && len(vs) > 0 {
			return vs[0]
		}
		return ""
	}
	joined := func(k string) string {
		if vs, ok := fields[k]; ok {
			return strings.Join(vs, " ")
		}
		return ""
	}

	if one("pkgname") == "" || one("pkgver") == "" {
		return nil, fmt.Errorf(".PKGINFO missing required pkgname/pkgver")
	}

	var b strings.Builder
	put := func(key, val string) {
		// Empty optional fields are still emitted with empty value when
		// real apk-tools emits them (notably U:); preserve that shape.
		fmt.Fprintf(&b, "%s:%s\n", key, val)
	}

	put("P", one("pkgname"))
	put("V", one("pkgver"))
	put("A", one("arch"))
	put("L", one("license"))
	put("T", one("pkgdesc"))
	put("o", one("origin"))
	put("m", one("maintainer"))
	put("U", one("url"))
	if d := joined("depend"); d != "" {
		put("D", d)
	}
	if p := joined("provides"); p != "" {
		put("p", p)
	}
	if c := one("commit"); c != "" {
		put("c", c)
	}
	put("i", "[]")
	if t := one("builddate"); t != "" {
		put("t", t)
	}
	if i := one("size"); i != "" {
		put("I", i)
	}
	if k := one("provider_priority"); k != "" {
		put("k", k)
	}
	b.WriteString("\n")
	return []byte(b.String()), nil
}

// installedDBEntries returns the tar entries (parent directories + the
// installed-db file itself) needed to land an installed-db record at path
// in a layer that syft's stereoscope will index. Parent directory entries
// are required — without them stereoscope treats the file as orphaned and
// the apk cataloger reports zero packages on the assembled image (the same
// failure mode //oci/distroless/common:dpkg_status_d_dirs exists to dodge).
func installedDBEntries(installedAt string, body []byte) []entry {
	clean := strings.TrimPrefix(installedAt, "./")
	clean = strings.TrimRight(clean, "/")
	if clean == "" {
		return nil
	}
	var out []entry
	parts := strings.Split(clean, "/")
	for i := 1; i < len(parts); i++ {
		dir := path.Join(parts[:i]...) + "/"
		out = append(out, entry{
			hdr: &tar.Header{
				Name:     dir,
				Mode:     0o755,
				Typeflag: tar.TypeDir,
			},
		})
	}
	out = append(out, entry{
		hdr: &tar.Header{
			Name:     clean,
			Mode:     0o644,
			Size:     int64(len(body)),
			Typeflag: tar.TypeReg,
		},
		body: body,
	})
	return out
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
		// Canonicalise on the `./`-prefixed form rules_distroless and tar.bzl
		// emit. flatten()'s deduplicate=True compares names by string equality,
		// so without this prefix our `usr/` and tar.bzl's `./usr/` both end up
		// in the layer and dockerd rejects it as "duplicates of file paths not
		// supported".
		h.Name = "./" + strings.TrimPrefix(h.Name, "./")
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

func run(in, out string, allow []string, installedAt string) error {
	if len(allow) == 0 {
		return errors.New("--keep is required (at least one path prefix)")
	}
	f, err := os.Open(in)
	if err != nil {
		return fmt.Errorf("open input: %w", err)
	}
	defer f.Close()

	entries, pkginfo, err := extract(f, allow)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return fmt.Errorf("no entries matched --keep %v", allow)
	}

	if installedAt != "" {
		if len(pkginfo) == 0 {
			return errors.New("--installed-db-at set but .PKGINFO was not present in the apk")
		}
		record, err := pkginfoToInstalledDB(pkginfo)
		if err != nil {
			return err
		}
		entries = append(entries, installedDBEntries(installedAt, record)...)
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
	installedAt := flag.String("installed-db-at", "", "tar-path at which to emit a synthesised /lib/apk/db/installed entry derived from the apk's .PKGINFO (e.g. usr/lib/apk/db/installed)")
	var allow stringSlice
	flag.Var(&allow, "keep", "path prefix to include (repeatable); at least one required")
	flag.Parse()

	if *in == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "usage: wolfi-apk-extract --in <apk> --out <tar> --keep <path>... [--installed-db-at <path>]")
		os.Exit(2)
	}
	if err := run(*in, *out, allow, *installedAt); err != nil {
		fmt.Fprintf(os.Stderr, "wolfi-apk-extract: %v\n", err)
		os.Exit(1)
	}
}
