package main

import (
	_ "embed"
	"os"
	"strings"
	"testing"

	bifrostv1alpha1 "github.com/arkeros/senku/bifrost/pkg/api/v1alpha1"
)

//go:embed testdata/service.yaml
var serviceFixture string

//go:embed testdata/cronjob.yaml
var cronJobFixture string

func TestRenderCloudRun(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("service.yaml")
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
		"namespace: \"874944788122\"",
		"serviceAccountName: svc-registry@senku-prod.iam.gserviceaccount.com",
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

func TestRenderCloudRunCronJob(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("cronjob.yaml")
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	got, err := RenderCloudRun(spec)
	if err != nil {
		t.Fatalf("RenderCloudRun() error = %v", err)
	}
	for _, want := range []string{
		"apiVersion: run.googleapis.com/v1",
		"kind: Job",
		"name: crossdocking-stock-flow",
		"namespace: \"874944788122\"",
		"cloud.googleapis.com/location: europe-west1",
		"run.googleapis.com/vpc-access-egress: private-ranges-only",
		"run.googleapis.com/vpc-access-connector: projects/senku-prod/locations/europe-west1/connectors/internal",
		"run.googleapis.com/secrets: stock-flow-env:projects/123456789/secrets/custom--stock-flow-env",
		"parallelism: 1",
		"taskCount: 1",
		"maxRetries: 3",
		"timeoutSeconds: \"600\"",
		"serviceAccountName: crj-crossdocking-stock-flow@senku-prod.iam.gserviceaccount.com",
		"mountPath: /run/secrets",
		"secretName: stock-flow-env",
	} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("cloudrun cronjob output missing %q\n%s", want, got)
		}
	}
}

func TestRenderKubernetes(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("service.yaml")
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
		"iam.gke.io/gcp-service-account: svc-registry@senku-prod.iam.gserviceaccount.com",
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

func TestRenderKubernetesCronJob(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("cronjob.yaml")
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	got, err := RenderKubernetes(spec)
	if err != nil {
		t.Fatalf("RenderKubernetes() error = %v", err)
	}
	for _, want := range []string{
		"kind: ServiceAccount",
		"kind: CronJob",
		"namespace: jobs",
		"schedule: 0 12 * * *",
		"timeZone: Europe/Madrid",
		"iam.gke.io/gcp-service-account: crj-crossdocking-stock-flow@senku-prod.iam.gserviceaccount.com",
		"restartPolicy: Never",
		"backoffLimit: 3",
		"activeDeadlineSeconds: 600",
		"mountPath: /run/secrets",
		"secretName: stock-flow-env",
	} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("k8s cronjob output missing %q\n%s", want, got)
		}
	}
}

func TestRenderTerraform(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("service.yaml")
	if err != nil {
		t.Fatalf("ParseServiceSpec() error = %v", err)
	}
	got, err := RenderTerraform(spec)
	if err != nil {
		t.Fatalf("RenderTerraform() error = %v", err)
	}
	for _, want := range []string{
		`resource "google_service_account" "svc_registry" {`,
		`resource "google_service_account_iam_member" "svc_registry_workload_identity" {`,
		`project      = "senku-prod"`,
		`account_id   = "svc-registry"`,
		`display_name = "Runtime identity for registry"`,
		`role               = "roles/iam.workloadIdentityUser"`,
		`member             = "serviceAccount:senku-prod.svc.id.goog[default/registry]"`,
	} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("terraform output missing %q\n%s", want, got)
		}
	}
}

func TestRenderTerraformCronJob(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("cronjob.yaml")
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	got, err := RenderTerraform(spec)
	if err != nil {
		t.Fatalf("RenderTerraform() error = %v", err)
	}
	for _, want := range []string{
		`resource "google_service_account" "crj_crossdocking_stock_flow" {`,
		`resource "google_service_account" "sch_crossdocking_stock_flow" {`,
		`resource "google_project_iam_member" "sch_crossdocking_stock_flow_run_invoker" {`,
		`resource "google_cloud_scheduler_job" "crossdocking_stock_flow_schedule" {`,
		`project      = "senku-prod"`,
		`account_id   = "crj-crossdocking-stock-flow"`,
		`account_id   = "sch-crossdocking-stock-flow"`,
		`role    = "roles/run.invoker"`,
		`uri         = "https://run.googleapis.com/v2/projects/senku-prod/locations/europe-west1/jobs/crossdocking-stock-flow:run"`,
		`time_zone = "Europe/Madrid"`,
	} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("terraform cronjob output missing %q\n%s", want, got)
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
    cloudRun:
      region: europe-west3
`))
	if err == nil || (!strings.Contains(err.Error(), "projectId") && !strings.Contains(err.Error(), "projectNumber")) {
		t.Fatalf("ParseServiceSpec() error = %v, want project validation", err)
	}
}

func TestParseServiceSpecAppliesDefaults(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("service.yaml")
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
	if got, want := spec.Spec.ServiceAccountName, "svc-registry@senku-prod.iam.gserviceaccount.com"; got != want {
		t.Fatalf("spec.Spec.ServiceAccountName = %q, want %q", got, want)
	}
}

func TestParseCronJobAppliesDefaults(t *testing.T) {
	t.Parallel()

	spec, err := bifrostv1alpha1.Parse(strings.NewReader(`
apiVersion: bifrost.apotema.cloud/v1alpha1
kind: CronJob
metadata:
  name: daily-report
spec:
  image: report
  resources:
    limits:
      cpu: 1000m
      memory: 512Mi
  schedule:
    cron: "0 1 * * *"
    timeZone: Europe/Madrid
  gcp:
    projectId: senku-prod
    projectNumber: "874944788122"
    cloudScheduler: {}
    cloudRun:
      region: europe-west1
`))
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if got, want := spec.Spec.ServiceAccountName, "crj-daily-report@senku-prod.iam.gserviceaccount.com"; got != want {
		t.Fatalf("spec.Spec.ServiceAccountName = %q, want %q", got, want)
	}
	if got, want := spec.Spec.Job.Parallelism, int32(1); got != want {
		t.Fatalf("spec.Spec.Job.Parallelism = %d, want %d", got, want)
	}
	if got, want := spec.Spec.Job.Completions, int32(1); got != want {
		t.Fatalf("spec.Spec.Job.Completions = %d, want %d", got, want)
	}
	if got, want := spec.Spec.Job.MaxRetries, int32(3); got != want {
		t.Fatalf("spec.Spec.Job.MaxRetries = %d, want %d", got, want)
	}
	if got, want := spec.Spec.Job.TimeoutSeconds, int64(600); got != want {
		t.Fatalf("spec.Spec.Job.TimeoutSeconds = %d, want %d", got, want)
	}
	if got, want := spec.Spec.GCP.CloudScheduler.Region, "europe-west1"; got != want {
		t.Fatalf("spec.Spec.GCP.CloudScheduler.Region = %q, want %q", got, want)
	}
}

func loadSpecFixture(name string) (bifrostv1alpha1.Workload, error) {
	switch name {
	case "service.yaml":
		return bifrostv1alpha1.Parse(strings.NewReader(serviceFixture))
	case "cronjob.yaml":
		return bifrostv1alpha1.Parse(strings.NewReader(cronJobFixture))
	default:
		return bifrostv1alpha1.Workload{}, os.ErrNotExist
	}
}
