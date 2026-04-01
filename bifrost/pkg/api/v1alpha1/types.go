package v1alpha1

import (
	"fmt"
	"io"
	"strings"
	"unicode"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"sigs.k8s.io/yaml"
)

const (
	APIVersion = "bifrost.apotema.cloud/v1alpha1"
	Kind       = "Service"
)

type Service struct {
	APIVersion string     `yaml:"apiVersion"`
	Kind       string     `yaml:"kind"`
	Metadata   ObjectMeta `yaml:"metadata"`
	Spec       Spec       `yaml:"spec"`
}

type ObjectMeta struct {
	Name string `yaml:"name"`
}

type Spec struct {
	Image              string                      `yaml:"image"`
	ServiceAccountName string                      `yaml:"serviceAccountName"`
	Args               []string                    `yaml:"args"`
	Port               int32                       `yaml:"port"`
	Resources          corev1.ResourceRequirements `yaml:"resources"`
	Probes             ProbeSpec                   `yaml:"probes"`
	Autoscaling        AutoscalingSpec             `yaml:"autoscaling"`
	GCP                GCPSpec                     `yaml:"gcp"`
	Kubernetes         KubernetesSpec              `yaml:"kubernetes"`
}

type GCPSpec struct {
	ProjectID string       `yaml:"projectId"`
	CloudRun  CloudRunSpec `yaml:"cloudRun"`
}

type ProbeSpec struct {
	StartupPath  string `yaml:"startupPath"`
	LivenessPath string `yaml:"livenessPath"`
}

type CloudRunSpec struct {
	Region               string `yaml:"region"`
	Ingress              string `yaml:"ingress"`
	ExecutionEnvironment string `yaml:"executionEnvironment"`
	Public               bool   `yaml:"public"`
}

type KubernetesSpec struct {
	ServiceType string `yaml:"serviceType"`
	Namespace   string `yaml:"namespace"`
}

type AutoscalingSpec struct {
	MinReplicas          int32 `yaml:"min"`
	MaxReplicas          int32 `yaml:"max"`
	Concurrency          int64 `yaml:"concurrency"`
	TargetCPUUtilization int32 `yaml:"targetCPUUtilization"`
}

func Parse(r io.Reader) (Service, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return Service{}, err
	}
	var spec Service
	if err := yaml.Unmarshal(data, &spec); err != nil {
		return Service{}, err
	}
	if err := spec.Validate(); err != nil {
		return Service{}, err
	}
	return spec, nil
}

func (s *Service) Validate() error {
	if s.APIVersion != APIVersion {
		return fmt.Errorf("unsupported apiVersion %q", s.APIVersion)
	}
	if s.Kind != Kind {
		return fmt.Errorf("unsupported kind %q", s.Kind)
	}
	if s.Metadata.Name == "" {
		return fmt.Errorf("metadata.name is required")
	}
	if s.Spec.Image == "" {
		return fmt.Errorf("spec.image is required")
	}
	if s.Spec.GCP.ProjectID == "" {
		return fmt.Errorf("spec.gcp.projectId is required")
	}
	if s.Spec.ServiceAccountName == "" {
		accountID, err := defaultServiceAccountAccountID(s.Metadata.Name)
		if err != nil {
			return err
		}
		s.Spec.ServiceAccountName = fmt.Sprintf("%s@%s.iam.gserviceaccount.com", accountID, s.Spec.GCP.ProjectID)
	}
	if !strings.Contains(s.Spec.ServiceAccountName, "@") {
		return fmt.Errorf("spec.serviceAccountName must be a Google service account email")
	}
	if projectID, err := projectIDFromServiceAccountEmail(s.Spec.ServiceAccountName); err != nil {
		return err
	} else if projectID != s.Spec.GCP.ProjectID {
		return fmt.Errorf("spec.serviceAccountName project %q does not match spec.gcp.projectId %q", projectID, s.Spec.GCP.ProjectID)
	}
	if s.Spec.Port <= 0 {
		return fmt.Errorf("spec.port must be greater than zero")
	}
	if s.Spec.Resources.Limits == nil {
		s.Spec.Resources.Limits = corev1.ResourceList{}
	}
	if s.Spec.Resources.Requests == nil {
		s.Spec.Resources.Requests = corev1.ResourceList{}
	}
	if _, ok := s.Spec.Resources.Limits[corev1.ResourceCPU]; !ok {
		return fmt.Errorf("spec.resources.limits.cpu and spec.resources.limits.memory are required")
	}
	if _, ok := s.Spec.Resources.Limits[corev1.ResourceMemory]; !ok {
		return fmt.Errorf("spec.resources.limits.cpu and spec.resources.limits.memory are required")
	}
	if _, ok := s.Spec.Resources.Requests[corev1.ResourceCPU]; !ok {
		s.Spec.Resources.Requests[corev1.ResourceCPU] = s.Spec.Resources.Limits[corev1.ResourceCPU]
	}
	if _, ok := s.Spec.Resources.Requests[corev1.ResourceMemory]; !ok {
		s.Spec.Resources.Requests[corev1.ResourceMemory] = s.Spec.Resources.Limits[corev1.ResourceMemory]
	}
	if err := validateResourceQuantity("spec.resources.requests.cpu", s.Spec.Resources.Requests[corev1.ResourceCPU]); err != nil {
		return err
	}
	if err := validateResourceQuantity("spec.resources.requests.memory", s.Spec.Resources.Requests[corev1.ResourceMemory]); err != nil {
		return err
	}
	if err := validateResourceQuantity("spec.resources.limits.cpu", s.Spec.Resources.Limits[corev1.ResourceCPU]); err != nil {
		return err
	}
	if err := validateResourceQuantity("spec.resources.limits.memory", s.Spec.Resources.Limits[corev1.ResourceMemory]); err != nil {
		return err
	}
	if s.Spec.GCP.CloudRun.Region == "" {
		return fmt.Errorf("spec.gcp.cloudRun.region is required")
	}
	if s.Spec.GCP.CloudRun.Ingress == "" {
		s.Spec.GCP.CloudRun.Ingress = "all"
	}
	if s.Spec.GCP.CloudRun.ExecutionEnvironment == "" {
		s.Spec.GCP.CloudRun.ExecutionEnvironment = "gen2"
	}
	if s.Spec.Kubernetes.ServiceType == "" {
		s.Spec.Kubernetes.ServiceType = "ClusterIP"
	}
	if s.Spec.Kubernetes.Namespace == "" {
		s.Spec.Kubernetes.Namespace = "default"
	}
	if s.Spec.Autoscaling.MinReplicas < 0 {
		return fmt.Errorf("spec.autoscaling.min must be greater than or equal to zero")
	}
	if s.Spec.Autoscaling.MaxReplicas <= 0 {
		s.Spec.Autoscaling.MaxReplicas = 3
	}
	if s.Spec.Autoscaling.MaxReplicas < s.Spec.Autoscaling.MinReplicas {
		return fmt.Errorf("spec.autoscaling.max must be greater than or equal to min")
	}
	if s.Spec.Autoscaling.Concurrency <= 0 {
		s.Spec.Autoscaling.Concurrency = 80
	}
	if s.Spec.Autoscaling.TargetCPUUtilization <= 0 {
		s.Spec.Autoscaling.TargetCPUUtilization = 80
	}
	return nil
}

func validateResourceQuantity(field string, q resource.Quantity) error {
	if q.Sign() <= 0 {
		return fmt.Errorf("%s must be greater than zero", field)
	}
	return nil
}

func projectIDFromServiceAccountEmail(email string) (string, error) {
	local, domain, ok := strings.Cut(strings.TrimSpace(email), "@")
	if !ok || local == "" || domain == "" {
		return "", fmt.Errorf("invalid service account email %q", email)
	}
	const suffix = ".iam.gserviceaccount.com"
	if !strings.HasSuffix(domain, suffix) {
		return "", fmt.Errorf("spec.serviceAccountName must be a Google service account email")
	}
	return strings.TrimSuffix(domain, suffix), nil
}

func defaultServiceAccountAccountID(serviceName string) (string, error) {
	var out strings.Builder
	for _, r := range strings.TrimSpace(serviceName) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			out.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			out.WriteRune(unicode.ToLower(r))
		case r == '-', r == '.':
			out.WriteByte('-')
		}
	}
	if out.Len() == 0 {
		return "", fmt.Errorf("metadata.name does not produce a valid default service account")
	}
	accountID := "svc-" + strings.Trim(out.String(), "-")
	if len(accountID) < 6 || len(accountID) > 30 {
		return "", fmt.Errorf("default service account account ID %q must be between 6 and 30 characters", accountID)
	}
	return accountID, nil
}
