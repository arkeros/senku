// apkdb-merge: N installed-fragment files -> one tar containing
// /lib/apk/db/installed with the concatenated, sorted records.
//
// Each fragment is one APKINDEX-format stanza terminated by a blank
// line (the shape apk-extract emits). Output ordering is by package
// name (P: field) for byte-determinism across runs with the same
// inputs in any order.
package main

import (
	"archive/tar"
	"bufio"
	"bytes"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

func main() {
	var (
		outTar = flag.String("out", "", "output tar containing /lib/apk/db/installed")
	)
	flag.Parse()

	if *outTar == "" {
		fmt.Fprintln(os.Stderr, "apkdb-merge: --out is required")
		os.Exit(2)
	}
	if flag.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "apkdb-merge: at least one fragment positional arg is required")
		os.Exit(2)
	}

	fragments := flag.Args()
	if err := Merge(fragments, *outTar); err != nil {
		fmt.Fprintln(os.Stderr, "apkdb-merge:", err)
		os.Exit(1)
	}
}

// Merge reads each fragment file, sorts by P: line, concatenates, and
// writes the result as a USTAR tar containing /lib/apk/db/installed.
func Merge(fragmentPaths []string, outTarPath string) (err error) {
	type stanza struct {
		name string
		body []byte
	}
	var stanzas []stanza
	for _, p := range fragmentPaths {
		raw, err := os.ReadFile(p)
		if err != nil {
			return fmt.Errorf("read fragment %s: %w", p, err)
		}
		name := extractPkgName(raw)
		if name == "" {
			return fmt.Errorf("fragment %s missing P: line", p)
		}
		stanzas = append(stanzas, stanza{name: name, body: raw})
	}
	sort.Slice(stanzas, func(i, j int) bool {
		return stanzas[i].name < stanzas[j].name
	})

	var combined bytes.Buffer
	for _, s := range stanzas {
		// Each fragment already ends in "\n\n"; if a malformed one
		// doesn't, normalise so the concat boundary stays valid.
		combined.Write(s.body)
		if !bytes.HasSuffix(s.body, []byte("\n\n")) {
			if !bytes.HasSuffix(s.body, []byte("\n")) {
				combined.WriteByte('\n')
			}
			combined.WriteByte('\n')
		}
	}

	out, err := os.Create(outTarPath)
	if err != nil {
		return fmt.Errorf("create out tar: %w", err)
	}
	defer func() {
		if closeErr := out.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close out tar: %w", closeErr)
		}
	}()

	tw := tar.NewWriter(out)
	defer func() {
		if closeErr := tw.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close tar writer: %w", closeErr)
		}
	}()

	// Parent directories so a strict tar extractor doesn't error on a
	// missing /lib/apk/db prefix. Canonical zero mtime everywhere.
	mt := time.Unix(0, 0)
	for _, dir := range []string{"./lib", "./lib/apk", "./lib/apk/db"} {
		if err := tw.WriteHeader(&tar.Header{
			Name:     dir + "/",
			Mode:     0o755,
			Typeflag: tar.TypeDir,
			ModTime:  mt,
			Format:   tar.FormatUSTAR,
		}); err != nil {
			return fmt.Errorf("write dir %q: %w", dir, err)
		}
	}
	if err := tw.WriteHeader(&tar.Header{
		Name:     "./lib/apk/db/installed",
		Mode:     0o644,
		Size:     int64(combined.Len()),
		Typeflag: tar.TypeReg,
		ModTime:  mt,
		Format:   tar.FormatUSTAR,
	}); err != nil {
		return fmt.Errorf("write installed header: %w", err)
	}
	if _, err := tw.Write(combined.Bytes()); err != nil {
		return fmt.Errorf("write installed body: %w", err)
	}
	return nil
}

// extractPkgName scans a fragment for the first "P:<name>" line.
func extractPkgName(raw []byte) string {
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "P:") {
			return strings.TrimSpace(line[2:])
		}
	}
	return ""
}
