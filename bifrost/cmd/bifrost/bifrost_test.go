package main

import (
	"strings"
	"testing"

	bifrostv1alpha1 "github.com/arkeros/senku/bifrost/pkg/api/v1alpha1"
)

const registrySpecYAML = `
apiVersion: bifrost.apotema.cloud/v1alpha1
kind: Service
metadata:
  name: registry
spec:
  image: registry
  serviceAccountName: registry-sa@senku-prod.iam.gserviceaccount.com
  args:
    - --upstream=ghcr.io
    - --repository-prefix=arkeros/senku
  port: 8080
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 1000m
      memory: 256Mi
  probes:
    startupPath: /v2/
    livenessPath: /v2/
  autoscaling:
    min: 0
    max: 3
  gcp:
    projectId: senku-prod
    cloudRun:
      region: europe-west3
      ingress: all
  kubernetes: {}
`

func TestRenderCloudRun(t *testing.T) {
	t.Parallel()

	spec, err := bifrostv1alpha1.Parse(strings.NewReader(registrySpecYAML))
	if err != nil {
		t.Fatalf("ParseServiceSpec() error = %v", err)
	}
	got, err := RenderCloudRun(spec)
	if err != nil {
		t.Fatalf("RenderCloudRun() error = %v", err)
	}
	for _, want := range []string{
		"apiVersion: serving.knative.dev/v1",
		"kind: Service",
		"name: registry",
		"serviceAccountName: registry-sa@senku-prod.iam.gserviceaccount.com",
		"containerConcurrency: 80",
		"minScale: \"0\"",
		"run.googleapis.com/execution-environment: gen2",
		"requests:",
		"cpu: 250m",
		"run.googleapis.com/ingress: all",
	} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("cloudrun output missing %q\n%s", want, got)
		}
	}
	if strings.Contains(string(got), "\nstatus:") {
		t.Fatalf("cloudrun output should not contain status\n%s", got)
	}
}

func TestRenderKubernetes(t *testing.T) {
	t.Parallel()

	spec, err := bifrostv1alpha1.Parse(strings.NewReader(registrySpecYAML))
	if err != nil {
		t.Fatalf("ParseServiceSpec() error = %v", err)
	}
	got, err := RenderKubernetes(spec)
	if err != nil {
		t.Fatalf("RenderKubernetes() error = %v", err)
	}
	for _, want := range []string{
		"apiVersion: apps/v1",
		"kind: ServiceAccount",
		"kind: Deployment",
		"kind: HorizontalPodAutoscaler",
		"kind: Service",
		"namespace: default",
		"iam.gke.io/gcp-service-account: registry-sa@senku-prod.iam.gserviceaccount.com",
		"serviceAccountName: registry",
		"requests:",
		"cpu: 250m",
		"minReplicas: 1",
		"maxReplicas: 3",
		"averageUtilization: 80",
		"type: ClusterIP",
	} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("k8s output missing %q\n%s", want, got)
		}
	}
	if strings.Contains(string(got), "\nstatus:") {
		t.Fatalf("k8s output should not contain status\n%s", got)
	}
}

func TestRenderTerraform(t *testing.T) {
	t.Parallel()

	spec, err := bifrostv1alpha1.Parse(strings.NewReader(registrySpecYAML))
	if err != nil {
		t.Fatalf("ParseServiceSpec() error = %v", err)
	}
	got, err := RenderTerraform(spec, "var.project_id")
	if err != nil {
		t.Fatalf("RenderTerraform() error = %v", err)
	}
	for _, want := range []string{
		`resource "google_service_account" "registry_sa" {`,
		`resource "google_service_account_iam_member" "registry_sa_workload_identity" {`,
		`project      = var.project_id`,
		`account_id   = "registry-sa"`,
		`display_name = "Runtime identity for registry"`,
		`role               = "roles/iam.workloadIdentityUser"`,
		`member             = format("serviceAccount:%s.svc.id.goog[%s/%s]", var.project_id, "default", "registry")`,
	} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("terraform output missing %q\n%s", want, got)
		}
	}
}

func TestParseServiceSpecValidatesRequiredFields(t *testing.T) {
	t.Parallel()

	_, err := bifrostv1alpha1.Parse(strings.NewReader(`
apiVersion: bifrost.apotema.cloud/v1alpha1
kind: Service
metadata:
  name: broken
spec:
  image: registry
  port: 8080
  resources:
    limits:
      cpu: 1000m
      memory: 256Mi
  gcp:
    projectId: senku-prod
    cloudRun:
      region: europe-west3
`))
	if err == nil || !strings.Contains(err.Error(), "serviceAccountName") {
		t.Fatalf("ParseServiceSpec() error = %v, want serviceAccountName validation", err)
	}
}

func TestParseServiceSpecAppliesDefaults(t *testing.T) {
	t.Parallel()

	spec, err := bifrostv1alpha1.Parse(strings.NewReader(registrySpecYAML))
	if err != nil {
		t.Fatalf("ParseServiceSpec() error = %v", err)
	}

	if got, want := spec.Spec.Autoscaling.Concurrency, int64(80); got != want {
		t.Fatalf("spec.Spec.Autoscaling.Concurrency = %d, want %d", got, want)
	}
	if got, want := spec.Spec.Autoscaling.TargetCPUUtilization, int32(80); got != want {
		t.Fatalf("spec.Spec.Autoscaling.TargetCPUUtilization = %d, want %d", got, want)
	}
	if got, want := spec.Spec.GCP.CloudRun.ExecutionEnvironment, "gen2"; got != want {
		t.Fatalf("spec.Spec.GCP.CloudRun.ExecutionEnvironment = %q, want %q", got, want)
	}
	if got, want := spec.Spec.Kubernetes.ServiceType, "ClusterIP"; got != want {
		t.Fatalf("spec.Spec.Kubernetes.ServiceType = %q, want %q", got, want)
	}
	if got, want := spec.Spec.Kubernetes.Namespace, "default"; got != want {
		t.Fatalf("spec.Spec.Kubernetes.Namespace = %q, want %q", got, want)
	}
}
