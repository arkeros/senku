// apk-extract: one .apk -> (content.tar, installed.fragment).
//
// Inputs: a single APK file already SHA256-verified by Bazel via the
// repository_ctx download attribute.
//
// Outputs:
//
//	content.tar          tar of the data-segment paths after allow-list
//	                     filtering. Upstream tar mtime/uid/gid preserved
//	                     (same .apk bytes → same values), format pinned to
//	                     USTAR.
//	installed.fragment   the package's installed-db stanza, ready to be
//	                     concatenated by apkdb-merge into the image's
//	                     /lib/apk/db/installed.
//
// Why no signature check here: the trust chain at lock time anchors on the
// signed APKINDEX.tar.gz (verified by `pin`), which records each
// package's sha256. Bazel's repository_ctx.download then re-checks the
// sha256 every download, so the bytes apk-extract sees are byte-equal to
// what the signed index promised. See README.md.
package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha1" //nolint:gosec // apk-tools' historical control-segment digest
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"chainguard.dev/apko/pkg/apk/apk"
	"chainguard.dev/apko/pkg/apk/expandapk"
	"chainguard.dev/apko/pkg/apk/types"
)

func main() {
	var (
		apkPath     = flag.String("apk", "", "path to .apk file")
		contentOut  = flag.String("content-out", "", "output content tar")
		fragOut     = flag.String("installed-out", "", "output installed-db fragment")
		wantPackage = flag.String("package", "", "expected package name (sanity check)")
		wantVersion = flag.String("version", "", "expected version (sanity check)")
		wantArch    = flag.String("arch", "", "expected arch (sanity check)")
	)
	flag.Parse()

	if *apkPath == "" || *contentOut == "" || *fragOut == "" {
		fmt.Fprintln(os.Stderr, "apk-extract: --apk, --content-out, --installed-out are required")
		os.Exit(2)
	}

	if err := Extract(*apkPath, *contentOut, *fragOut, *wantPackage, *wantVersion, *wantArch); err != nil {
		fmt.Fprintln(os.Stderr, "apk-extract:", err)
		os.Exit(1)
	}
}

// Extract reads the APK at apkPath, writes the filtered content tar to
// contentTarPath, and writes the installed-db fragment to fragPath.
//
// wantPackage/wantVersion/wantArch are optional sanity checks against the
// parsed .PKGINFO; empty values skip the check.
//
// apko's expandapk.Split detects whether the APK is 2-stream (control,
// data) or 3-stream (signature, control, data) automatically — both
// wolfi/melange and traditional apk-tools formats are handled the same
// way. apk.PackageToInstalled emits the canonical installed-db stanza
// shape syft and trivy expect, including the C: SHA-1 checksum over
// the control segment.
func Extract(apkPath, contentTarPath, fragPath, wantPackage, wantVersion, wantArch string) (err error) {
	f, err := os.Open(apkPath)
	if err != nil {
		return fmt.Errorf("open apk: %w", err)
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat apk: %w", err)
	}

	streams, err := expandapk.Split(f)
	if err != nil {
		return fmt.Errorf("split apk: %w", err)
	}

	var controlGz, dataGz io.Reader
	switch len(streams) {
	case 2:
		controlGz, dataGz = streams[0], streams[1]
	case 3:
		controlGz, dataGz = streams[1], streams[2]
	default:
		return fmt.Errorf("unexpected APK segment count: %d", len(streams))
	}

	// Drain the control stream into memory: we both gunzip+parse it for
	// .PKGINFO and SHA-1 the compressed bytes for the C: installed-db
	// field (apk-tools' canonical "checksum of control segment"
	// signature, encoded as Q1<base64>).
	controlBytes, err := io.ReadAll(controlGz)
	if err != nil {
		return fmt.Errorf("read control stream: %w", err)
	}
	controlSha1 := sha1.Sum(controlBytes) //nolint:gosec
	pkginfo, err := parsePkgInfo(controlBytes)
	if err != nil {
		return err
	}
	if err := validatePkgInfo(pkginfo, wantPackage, wantVersion, wantArch); err != nil {
		return err
	}

	pkg := pkgFromPkgInfo(pkginfo, controlSha1[:], stat.Size())
	if err := writeFragment(fragPath, pkg); err != nil {
		return err
	}

	return writeContentTar(dataGz, contentTarPath)
}

// parsePkgInfo gunzips the control segment and parses the embedded
// .PKGINFO via apko's canonical ini-based parser. The control segment
// is a single gzipped tar; we don't care about install scripts (apko
// runs them at install time; distroless images don't).
func parsePkgInfo(controlBytes []byte) (*types.PackageInfo, error) {
	gz, err := gzip.NewReader(byteReaderOf(controlBytes))
	if err != nil {
		return nil, fmt.Errorf("control gunzip: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil, fmt.Errorf(".PKGINFO not found in control segment")
		}
		if err != nil {
			return nil, fmt.Errorf("control tar: %w", err)
		}
		if hdr.Name == ".PKGINFO" {
			info, err := types.ParsePackageInfo(tr)
			if err != nil {
				return nil, fmt.Errorf("parse .PKGINFO: %w", err)
			}
			return info, nil
		}
	}
}

// pkgFromPkgInfo lifts the parsed .PKGINFO into the canonical
// apk.Package shape PackageToInstalled wants. Mirrors apko's own
// ParsePackage in package.go — same field mapping, same BuildTime
// derivation. Keeping the lift inline avoids re-streaming the apk
// through apko's ParsePackage (which would do its own Split).
func pkgFromPkgInfo(info *types.PackageInfo, controlSha1 []byte, apkSize int64) *apk.Package {
	return &apk.Package{
		Name:             info.Name,
		Version:          info.Version,
		Arch:             info.Arch,
		Description:      info.Description,
		License:          info.License,
		Origin:           info.Origin,
		Maintainer:       info.Maintainer,
		URL:              info.URL,
		Checksum:         controlSha1,
		Dependencies:     info.Dependencies,
		Provides:         info.Provides,
		InstallIf:        info.InstallIf,
		Size:             uint64(apkSize),
		InstalledSize:    info.Size,
		ProviderPriority: info.ProviderPriority,
		BuildTime:        unixIfNonZero(info.BuildDate),
		BuildDate:        info.BuildDate,
		RepoCommit:       info.RepoCommit,
		Replaces:         info.Replaces,
		DataHash:         info.DataHash,
	}
}

func unixIfNonZero(ts int64) time.Time {
	if ts == 0 {
		return time.Time{}
	}
	return time.Unix(ts, 0).UTC()
}

// writeFragment emits the per-package fragment from apk.PackageToInstalled.
// apkdb-merge concatenates these into /lib/apk/db/installed.
func writeFragment(path string, pkg *apk.Package) error {
	lines := apk.PackageToInstalled(pkg)
	body := strings.Join(lines, "\n") + "\n\n"
	return os.WriteFile(path, []byte(body), 0o644)
}

func validatePkgInfo(info *types.PackageInfo, wantPkg, wantVer, wantArch string) error {
	if wantPkg != "" && info.Name != wantPkg {
		return fmt.Errorf("package mismatch: .PKGINFO says %q, --package=%q", info.Name, wantPkg)
	}
	if wantVer != "" && info.Version != wantVer {
		return fmt.Errorf("version mismatch: .PKGINFO says %q, --version=%q", info.Version, wantVer)
	}
	if wantArch != "" && info.Arch != wantArch {
		return fmt.Errorf("arch mismatch: .PKGINFO says %q, --arch=%q", info.Arch, wantArch)
	}
	return nil
}

// writeContentTar copies the data segment (gzipped tar) to contentTarPath,
// applying the allow-list filter and pinning the output tar format to
// USTAR. The context argument keeps us aligned with apko's own
// expandapk model where cancellation propagates through stream reads.
func writeContentTar(dataGz io.Reader, contentTarPath string) (err error) {
	_ = context.Background() // reserved for future cancellation plumbing
	gz, err := gzip.NewReader(dataGz)
	if err != nil {
		return fmt.Errorf("data gunzip: %w", err)
	}
	defer gz.Close()

	out, err := os.Create(contentTarPath)
	if err != nil {
		return fmt.Errorf("create content tar: %w", err)
	}
	defer func() {
		if closeErr := out.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close content tar: %w", closeErr)
		}
	}()

	tw := tar.NewWriter(out)
	defer func() {
		if closeErr := tw.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close tar writer: %w", closeErr)
		}
	}()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read data tar: %w", err)
		}
		if shouldStrip(hdr.Name) {
			continue
		}
		newHdr := &tar.Header{
			Name:     hdr.Name,
			Mode:     hdr.Mode,
			Size:     hdr.Size,
			Typeflag: hdr.Typeflag,
			Linkname: hdr.Linkname,
			Uid:      hdr.Uid,
			Gid:      hdr.Gid,
			Uname:    hdr.Uname,
			Gname:    hdr.Gname,
			ModTime:  hdr.ModTime,
			Devmajor: hdr.Devmajor,
			Devminor: hdr.Devminor,
			Format:   tar.FormatUSTAR,
		}
		if newHdr.ModTime.IsZero() {
			// Empty mtime would force tar to PAX. Pin to epoch-1 when
			// upstream didn't set one.
			newHdr.ModTime = time.Unix(1, 0)
		}
		if err := tw.WriteHeader(newHdr); err != nil {
			return fmt.Errorf("write tar header for %q: %w", hdr.Name, err)
		}
		if hdr.Typeflag == tar.TypeReg {
			if _, err := io.Copy(tw, tr); err != nil {
				return fmt.Errorf("copy tar body for %q: %w", hdr.Name, err)
			}
		}
	}
	return nil
}

// shouldStrip drops paths that are useless on a distroless image. apk
// data segments are usually already lean (wolfi-os strips man/doc in
// abuild), but we apply the same allow-list as rpm-extract so the
// shape is uniform across distros.
func shouldStrip(filename string) bool {
	clean := strings.TrimPrefix(filename, "./")
	switch {
	case clean == ".PKGINFO":
		return true
	case strings.HasPrefix(clean, ".SIGN."):
		return true
	case strings.HasPrefix(clean, "usr/share/doc/"):
		return true
	case strings.HasPrefix(clean, "usr/share/man/"):
		return true
	case strings.HasPrefix(clean, "usr/share/info/"):
		return true
	case strings.HasPrefix(clean, "usr/share/locale/"):
		return true
	case strings.HasPrefix(clean, "var/cache/"):
		return true
	}
	return false
}

// byteReaderOf wraps a []byte as the bytes.Reader value gzip.NewReader
// expects. Local helper to keep the import surface minimal.
func byteReaderOf(b []byte) io.Reader { return &byteReader{b: b} }

type byteReader struct {
	b   []byte
	pos int
}

func (r *byteReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.pos:])
	r.pos += n
	return n, nil
}
