// Command hash_and_copy content-addresses a set of input files and emits a
// manifest mapping each original basename to its hashed filename.
//
// Output filenames have the shape `<stem>.<hash12>.<ext>`, where hash12 is the
// first 12 hex chars of the sha256 of the file bytes (48 bits; ~10⁻¹⁰
// birthday-collision probability at 1k files, which matches common asset
// pipelines).
//
// Path components in input filenames are always stripped before hashing —
// two inputs that share a basename produce a collision error rather than
// a silent overwrite, and no crafted input can write outside the out-dir.
//
// Usage:
//
//	hash_and_copy --out-dir <dir> --manifest <path> <src>...
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// hashLen is the number of hex chars taken from the sha256 digest. 12 hex =
// 48 bits. See package doc for the rationale.
const hashLen = 12

func hashedName(origName string, data []byte) string {
	base := filepath.Base(origName)
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	sum := sha256.Sum256(data)
	return stem + "." + hex.EncodeToString(sum[:])[:hashLen] + ext
}

func run(outDir, manifestPath string, srcs []string) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("mkdir out-dir: %w", err)
	}

	manifest := make(map[string]string, len(srcs))

	for _, src := range srcs {
		data, err := os.ReadFile(src)
		if err != nil {
			return fmt.Errorf("read %s: %w", src, err)
		}

		key := filepath.Base(src)
		if existing, collide := manifest[key]; collide {
			return fmt.Errorf("duplicate source basename %q (already mapped to %q); rename one input or use distinct stems", key, existing)
		}
		hashed := hashedName(key, data)
		manifest[key] = hashed

		dst := filepath.Join(outDir, hashed)
		if err := os.WriteFile(dst, data, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", dst, err)
		}
	}

	buf, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode manifest: %w", err)
	}
	if err := os.WriteFile(manifestPath, append(buf, '\n'), 0o644); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}
	return nil
}

func main() {
	outDir := flag.String("out-dir", "", "output directory (TreeArtifact); will be created if missing")
	manifestPath := flag.String("manifest", "", "path to write manifest JSON")
	flag.Parse()

	if *outDir == "" || *manifestPath == "" {
		fmt.Fprintln(os.Stderr, "usage: hash_and_copy --out-dir <dir> --manifest <path> <src>...")
		os.Exit(2)
	}

	if err := run(*outDir, *manifestPath, flag.Args()); err != nil {
		fmt.Fprintf(os.Stderr, "hash_and_copy: %v\n", err)
		os.Exit(1)
	}
}
