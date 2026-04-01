package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"os"
)

func main() {
	var inputPath string
	var projectExpr string
	var strict bool

	flag.StringVar(&inputPath, "in", "", "Path to a YAML manifest file. Reads stdin when omitted.")
	flag.StringVar(&projectExpr, "project_expr", "var.project_id", "Terraform expression used for the GCP project.")
	flag.BoolVar(&strict, "strict", false, "Treat shared service accounts as errors instead of warnings.")
	flag.Parse()

	reader, closeFn, err := inputReader(inputPath)
	if err != nil {
		log.Fatal(err)
	}
	if closeFn != nil {
		defer closeFn()
	}

	services, err := ParseKnativeServices(reader)
	if err != nil {
		log.Fatal(err)
	}

	out, warnings, err := GenerateTerraform(services, Options{
		ProjectExpr: projectExpr,
		Strict:      strict,
	})
	if err != nil {
		log.Fatal(err)
	}

	for _, warning := range warnings {
		fmt.Fprintf(os.Stderr, "warning: %s\n", warning)
	}

	fmt.Print(out)
}

func inputReader(path string) (io.Reader, func() error, error) {
	if path == "" {
		return os.Stdin, nil, nil
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	return f, f.Close, nil
}
