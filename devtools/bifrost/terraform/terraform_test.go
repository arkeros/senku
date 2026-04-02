package terraform

import (
	"os"
	"strings"
	"testing"

	bifrost "github.com/arkeros/senku/devtools/bifrost/api"
)

func loadSpecFixture(name string) (bifrost.Workload, error) {
	data, err := os.ReadFile("testdata/" + name)
	if err != nil {
		return bifrost.Workload{}, err
	}
	return bifrost.Parse(strings.NewReader(string(data)))
}

func TestRenderService(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("service.yaml")
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	got, err := Render(spec)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
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
			t.Fatalf("output missing %q\n%s", want, got)
		}
	}
}

func TestRenderCronJob(t *testing.T) {
	t.Parallel()

	spec, err := loadSpecFixture("cronjob.yaml")
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	got, err := Render(spec)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
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
			t.Fatalf("output missing %q\n%s", want, got)
		}
	}
}
