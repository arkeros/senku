package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"io"
	"os"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	utilyaml "k8s.io/apimachinery/pkg/util/yaml"
	"sigs.k8s.io/yaml"

	"github.com/arkeros/senku/platform/secrets"
	"github.com/arkeros/senku/platform/secrets/env"
	"github.com/arkeros/senku/platform/secrets/file"
	"github.com/arkeros/senku/platform/secrets/gcp"
)

func main() {
	var filename string
	flag.StringVar(&filename, "f", "-", "Path to manifest file, or - for stdin")
	flag.Parse()

	var r io.Reader
	if filename == "-" {
		r = os.Stdin
	} else {
		f, err := os.Open(filename)
		if err != nil {
			fatalf("open manifest: %v", err)
		}
		defer f.Close()
		r = f
	}

	ctx := context.Background()

	gcpProvider, gcpCleanup := gcp.NewProvider()
	defer gcpCleanup()

	fetch := secrets.NewFetcher(map[string]secrets.Provider{
		"gcp":  gcpProvider,
		"env":  env.Provider,
		"file": file.Provider,
	})

	// Buffer the entire output so that nothing reaches stdout (and thus
	// kubectl via the pipe) unless resolution succeeds completely.
	// A partial write would cause kubectl --prune to delete resources
	// that were absent from the truncated manifest.
	var buf bytes.Buffer
	if err := resolveManifest(ctx, r, &buf, fetch); err != nil {
		fatalf("%v", err)
	}
	if _, err := buf.WriteTo(os.Stdout); err != nil {
		fatalf("write output: %v", err)
	}
}

// resolveManifest reads a multi-document YAML stream, resolves Secret
// documents using fetch, and writes the result to w.
func resolveManifest(ctx context.Context, r io.Reader, w io.Writer, fetch secrets.Fetcher) error {
	decoder := utilyaml.NewYAMLOrJSONDecoder(r, 4096)
	first := true

	for {
		var raw runtime.RawExtension
		if err := decoder.Decode(&raw); err != nil {
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("decode document: %v", err)
		}

		doc := bytes.TrimSpace(raw.Raw)
		if len(doc) == 0 {
			continue
		}

		var meta metav1.TypeMeta
		if err := yaml.Unmarshal(doc, &meta); err != nil {
			return fmt.Errorf("parse document metadata: %v", err)
		}

		var err error
		if meta.Kind == "Secret" {
			var secret corev1.Secret
			if err := yaml.UnmarshalStrict(doc, &secret); err != nil {
				return fmt.Errorf("parse Secret: %v", err)
			}
			if err := resolveSecret(ctx, &secret, fetch); err != nil {
				return err
			}
			if doc, err = yaml.Marshal(&secret); err != nil {
				return fmt.Errorf("marshal resolved Secret: %v", err)
			}
		} else {
			// RawExtension stores JSON; convert back to YAML.
			var obj map[string]any
			if err := yaml.Unmarshal(doc, &obj); err != nil {
				return fmt.Errorf("parse document: %v", err)
			}
			if doc, err = yaml.Marshal(obj); err != nil {
				return fmt.Errorf("marshal document: %v", err)
			}
		}

		if !first {
			fmt.Fprintln(w, "---")
		}
		first = false
		w.Write(doc)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
