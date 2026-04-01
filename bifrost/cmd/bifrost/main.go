package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"os"

	bifrostv1alpha1 "github.com/arkeros/senku/bifrost/pkg/api/v1alpha1"
)

func main() {
	if len(os.Args) < 3 || os.Args[1] != "render" {
		log.Fatalf("usage: bifrost render <cloudrun|k8s|terraform> -f <service.yaml>")
	}

	target := os.Args[2]
	fs := flag.NewFlagSet("render", flag.ExitOnError)
	var inputPath string
	var projectExpr string
	fs.StringVar(&inputPath, "f", "", "Path to the service spec YAML")
	fs.StringVar(&projectExpr, "project_expr", "", "Optional Terraform expression used for the GCP project instead of spec.gcp.projectId")
	if err := fs.Parse(os.Args[3:]); err != nil {
		log.Fatal(err)
	}
	if inputPath == "" {
		log.Fatal("-f is required")
	}

	reader, closeFn, err := inputReader(inputPath)
	if err != nil {
		log.Fatal(err)
	}
	if closeFn != nil {
		defer closeFn()
	}

	spec, err := bifrostv1alpha1.Parse(reader)
	if err != nil {
		log.Fatal(err)
	}

	var out []byte
	switch target {
	case "cloudrun":
		out, err = RenderCloudRun(spec)
	case "k8s":
		out, err = RenderKubernetes(spec)
	case "terraform":
		out, err = RenderTerraform(spec, projectExpr)
	default:
		log.Fatalf("unsupported render target %q", target)
	}
	if err != nil {
		log.Fatal(err)
	}

	fmt.Print(string(out))
}

func inputReader(path string) (io.Reader, func() error, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	return f, f.Close, nil
}
