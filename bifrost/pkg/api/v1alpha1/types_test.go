package v1alpha1

import (
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

func validWorkload() Workload {
	return Workload{
		APIVersion: APIVersion,
		Kind:       KindService,
		Metadata:   ObjectMeta{Name: "test-svc"},
		Spec: Spec{
			Image: "test-image",
			Port:  8080,
			Resources: corev1.ResourceRequirements{
				Limits: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("1"),
					corev1.ResourceMemory: resource.MustParse("256Mi"),
				},
			},
			GCP: GCPSpec{
				ProjectID:     "my-project",
				ProjectNumber: "123456",
				CloudRun: CloudRunSpec{
					Region: "us-central1",
				},
			},
		},
	}
}

func TestValidate_CloudRunIngress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		ingress string
		wantErr bool
	}{
		{"empty defaults to all", "", false},
		{"all", "all", false},
		{"internal", "internal", false},
		{"internal-and-cloud-load-balancing", "internal-and-cloud-load-balancing", false},
		{"invalid value", "public", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			w := validWorkload()
			w.Spec.GCP.CloudRun.Ingress = tt.ingress
			err := w.Validate()
			if tt.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantErr && err != nil && !strings.Contains(err.Error(), "ingress") {
				t.Fatalf("error should mention ingress, got: %v", err)
			}
		})
	}
}

func TestValidate_CloudRunExecutionEnvironment(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		execEnv string
		wantErr bool
	}{
		{"empty defaults to gen2", "", false},
		{"gen1", "gen1", false},
		{"gen2", "gen2", false},
		{"invalid value", "gen3", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			w := validWorkload()
			w.Spec.GCP.CloudRun.ExecutionEnvironment = tt.execEnv
			err := w.Validate()
			if tt.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantErr && err != nil && !strings.Contains(err.Error(), "executionEnvironment") {
				t.Fatalf("error should mention executionEnvironment, got: %v", err)
			}
		})
	}
}
