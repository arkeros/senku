package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"io"
	"strings"
	"testing"
	"time"
)

// segment writes a single gzip-tar stream containing the given headers/bodies
// to w. Wolfi/Alpine .apk files are three such streams concatenated.
func segment(t *testing.T, w io.Writer, entries map[string]string) {
	t.Helper()
	gz := gzip.NewWriter(w)
	tw := tar.NewWriter(gz)
	for name, body := range entries {
		hdr := &tar.Header{
			Name:     name,
			Mode:     0o644,
			Size:     int64(len(body)),
			Typeflag: tar.TypeReg,
			ModTime:  time.Unix(1700000000, 0),
			Uid:      1000,
			Gid:      1000,
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestExtractWalksAllThreeStreams(t *testing.T) {
	var apk bytes.Buffer
	// Signature segment — never want any of this.
	segment(t, &apk, map[string]string{".SIGN.RSA.foo.pub": "sig"})
	// Control segment — never want any of this.
	segment(t, &apk, map[string]string{".PKGINFO": "pkginfo", ".trigger": "scriptlet"})
	// Data segment — usr/bin/busybox is the only thing we ask for.
	segment(t, &apk, map[string]string{
		"usr/bin/busybox":                       "BUSYBOX_ELF",
		"etc/securetty":                         "pts/0\n",
		"var/lib/db/sbom/busybox-1.spdx.json":   "{}",
	})

	entries, err := extract(&apk, []string{"usr/bin/busybox"})
	if err != nil {
		t.Fatalf("extract: %v", err)
	}
	if len(entries) != 1 {
		names := make([]string, len(entries))
		for i, e := range entries {
			names[i] = e.hdr.Name
		}
		t.Fatalf("want 1 entry, got %d: %v", len(entries), names)
	}
	if entries[0].hdr.Name != "usr/bin/busybox" {
		t.Fatalf("got %q, want usr/bin/busybox", entries[0].hdr.Name)
	}
	if got := string(entries[0].body); got != "BUSYBOX_ELF" {
		t.Fatalf("body = %q", got)
	}
}

func TestWriteTarCanonicalizes(t *testing.T) {
	e := entry{
		hdr: &tar.Header{
			Name:     "usr/bin/busybox",
			Mode:     0o755,
			Size:     3,
			Typeflag: tar.TypeReg,
			ModTime:  time.Unix(1700000000, 0),
			Uid:      1000,
			Gid:      1000,
			Uname:    "wolfi",
			Gname:    "wolfi",
		},
		body: []byte("ELF"),
	}
	var buf bytes.Buffer
	if err := writeTar(&buf, []entry{e}); err != nil {
		t.Fatal(err)
	}
	tr := tar.NewReader(&buf)
	hdr, err := tr.Next()
	if err != nil {
		t.Fatal(err)
	}
	if hdr.Uid != 0 || hdr.Gid != 0 || hdr.Uname != "" || hdr.Gname != "" {
		t.Errorf("uid/gid not canonical: %+v", hdr)
	}
	if !hdr.ModTime.Equal(time.Unix(0, 0)) {
		t.Errorf("mtime = %v, want epoch", hdr.ModTime)
	}
}

func TestKeepDropsHiddenAndApkBookkeeping(t *testing.T) {
	cases := []struct {
		name  string
		allow []string
		want  bool
	}{
		{"usr/bin/busybox", []string{"usr/bin/busybox"}, true},
		{"usr/bin", []string{"usr/bin"}, true},
		{"usr/bin/cat", []string{"usr/bin"}, true},
		{"./usr/bin/busybox", []string{"usr/bin/busybox"}, true},

		{".PKGINFO", []string{""}, false},
		{".SIGN.RSA.key.pub", []string{".SIGN.RSA.key.pub"}, false},
		{"var/lib/db/sbom/busybox.spdx.json", []string{"var"}, false},
		{"var/lib/apk/index", []string{"var"}, false},
		{"etc/securetty", []string{"usr/bin/busybox"}, false},
	}
	for _, tc := range cases {
		got := keep(tc.name, tc.allow)
		if got != tc.want {
			t.Errorf("keep(%q, %v) = %v, want %v", tc.name, tc.allow, got, tc.want)
		}
	}
}

func TestDeterministicOutput(t *testing.T) {
	build := func() []byte {
		var apk bytes.Buffer
		segment(t, &apk, map[string]string{".PKGINFO": "pkg"})
		segment(t, &apk, map[string]string{
			"usr/bin/b": "B",
			"usr/bin/a": "A",
		})
		return apk.Bytes()
	}
	apk1, apk2 := build(), build()

	mk := func(in []byte) []byte {
		entries, err := extract(bytes.NewReader(in), []string{"usr/bin"})
		if err != nil {
			t.Fatal(err)
		}
		var out bytes.Buffer
		if err := writeTar(&out, entries); err != nil {
			t.Fatal(err)
		}
		return out.Bytes()
	}
	if !bytes.Equal(mk(apk1), mk(apk2)) {
		t.Fatal("output not byte-stable across runs")
	}
	// Sanity: entry order is sorted (a before b).
	tr := tar.NewReader(bytes.NewReader(mk(apk1)))
	names := []string{}
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		names = append(names, h.Name)
	}
	if strings.Join(names, ",") != "usr/bin/a,usr/bin/b" {
		t.Fatalf("order: %v", names)
	}
}
