package main

import (
	"strings"
	"testing"
)

func TestGenerateTerraformForDeclaredRuntimeIdentity(t *testing.T) {
	t.Parallel()

	services, err := ParseKnativeServices(strings.NewReader(`
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: registry
  labels:
    cloud.googleapis.com/location: europe-west3
spec:
  template:
    spec:
      serviceAccountName: registry-sa@senku-prod.iam.gserviceaccount.com
      containers:
        - image: ghcr.io/arkeros/senku/registry@sha256:deadbeef
`))
	if err != nil {
		t.Fatalf("ParseKnativeServices() error = %v", err)
	}

	got, warnings, err := GenerateTerraform(services, Options{ProjectExpr: "var.project_id"})
	if err != nil {
		t.Fatalf("GenerateTerraform() error = %v", err)
	}
	if len(warnings) != 0 {
		t.Fatalf("warnings = %v, want none", warnings)
	}

	for _, want := range []string{
		`# Referenced by services: registry`,
		`resource "google_service_account" "registry_sa" {`,
		`project = var.project_id`,
		`account_id = "registry-sa"`,
		`display_name = "Cloud Run runtime for registry"`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("generated Terraform missing %q\n%s", want, got)
		}
	}

	for _, unwanted := range []string{
		`google_cloud_run_v2_service`,
		`google_cloud_run_v2_service_iam_member`,
	} {
		if strings.Contains(got, unwanted) {
			t.Fatalf("generated Terraform unexpectedly contains %q\n%s", unwanted, got)
		}
	}
}

func TestGenerateTerraformFailsWithoutServiceAccountName(t *testing.T) {
	t.Parallel()

	services, err := ParseKnativeServices(strings.NewReader(`
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: registry
spec:
  template:
    spec:
      containers:
        - image: ghcr.io/arkeros/senku/registry@sha256:deadbeef
`))
	if err != nil {
		t.Fatalf("ParseKnativeServices() error = %v", err)
	}

	_, _, err = GenerateTerraform(services, Options{ProjectExpr: "var.project_id"})
	if err == nil || !strings.Contains(err.Error(), "serviceAccountName") {
		t.Fatalf("GenerateTerraform() error = %v, want missing serviceAccountName", err)
	}
}

func TestGenerateTerraformWarnsOnSharedServiceAccount(t *testing.T) {
	t.Parallel()

	services, err := ParseKnativeServices(strings.NewReader(`
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: registry
spec:
  template:
    spec:
      serviceAccountName: shared-sa@senku-prod.iam.gserviceaccount.com
      containers:
        - image: ghcr.io/arkeros/senku/registry@sha256:deadbeef
---
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: mirror
spec:
  template:
    spec:
      serviceAccountName: shared-sa@senku-prod.iam.gserviceaccount.com
      containers:
        - image: ghcr.io/arkeros/senku/mirror@sha256:deadbeef
`))
	if err != nil {
		t.Fatalf("ParseKnativeServices() error = %v", err)
	}

	got, warnings, err := GenerateTerraform(services, Options{ProjectExpr: "var.project_id"})
	if err != nil {
		t.Fatalf("GenerateTerraform() error = %v", err)
	}
	if len(warnings) != 1 {
		t.Fatalf("len(warnings) = %d, want 1 (%v)", len(warnings), warnings)
	}
	if !strings.Contains(warnings[0], `shared-sa@senku-prod.iam.gserviceaccount.com`) {
		t.Fatalf("warnings[0] = %q, want shared SA warning", warnings[0])
	}
	if strings.Count(got, `resource "google_service_account" "shared_sa"`) != 1 {
		t.Fatalf("expected one shared service account resource\n%s", got)
	}
}

func TestGenerateTerraformStrictFailsOnSharedServiceAccount(t *testing.T) {
	t.Parallel()

	services, err := ParseKnativeServices(strings.NewReader(`
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: registry
spec:
  template:
    spec:
      serviceAccountName: shared-sa@senku-prod.iam.gserviceaccount.com
      containers:
        - image: ghcr.io/arkeros/senku/registry@sha256:deadbeef
---
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: mirror
spec:
  template:
    spec:
      serviceAccountName: shared-sa@senku-prod.iam.gserviceaccount.com
      containers:
        - image: ghcr.io/arkeros/senku/mirror@sha256:deadbeef
`))
	if err != nil {
		t.Fatalf("ParseKnativeServices() error = %v", err)
	}

	_, _, err = GenerateTerraform(services, Options{ProjectExpr: "var.project_id", Strict: true})
	if err == nil || !strings.Contains(err.Error(), `shared-sa@senku-prod.iam.gserviceaccount.com`) {
		t.Fatalf("GenerateTerraform() error = %v, want shared SA error", err)
	}
}

func TestParseKnativeServicesSkipsUnsupportedKinds(t *testing.T) {
	t.Parallel()

	services, err := ParseKnativeServices(strings.NewReader(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: ignored
---
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: demo
spec:
  template:
    spec:
      serviceAccountName: demo-sa@senku-prod.iam.gserviceaccount.com
      containers:
        - image: us-docker.pkg.dev/cloudrun/container/hello
`))
	if err != nil {
		t.Fatalf("ParseKnativeServices() error = %v", err)
	}

	if len(services) != 1 {
		t.Fatalf("len(services) = %d, want 1", len(services))
	}

	if services[0].Name != "demo" {
		t.Fatalf("services[0].Name = %q, want demo", services[0].Name)
	}
}

func TestGenerateTerraformFailsWithoutSupportedServices(t *testing.T) {
	t.Parallel()

	_, _, err := GenerateTerraform(nil, Options{ProjectExpr: "var.project_id"})
	if err == nil {
		t.Fatal("GenerateTerraform() error = nil, want non-nil")
	}
}
