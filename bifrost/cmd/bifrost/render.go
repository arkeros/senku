package main

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"

	bifrostv1alpha1 "github.com/arkeros/senku/bifrost/pkg/api/v1alpha1"
	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclsyntax"
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/zclconf/go-cty/cty"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	servingv1 "knative.dev/serving/pkg/apis/serving/v1"
	"sigs.k8s.io/yaml"
)

func RenderCloudRun(spec bifrostv1alpha1.Service) ([]byte, error) {
	trueValue := true
	trafficPercent := int64(100)
	concurrency := spec.Spec.Autoscaling.Concurrency

	svc := servingv1.Service{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "serving.knative.dev/v1",
			Kind:       "Service",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name: spec.Metadata.Name,
			Annotations: map[string]string{
				"run.googleapis.com/ingress": spec.Spec.GCP.CloudRun.Ingress,
			},
			Labels: map[string]string{
				"cloud.googleapis.com/location": spec.Spec.GCP.CloudRun.Region,
			},
		},
		Spec: servingv1.ServiceSpec{
			ConfigurationSpec: servingv1.ConfigurationSpec{
				Template: servingv1.RevisionTemplateSpec{
					ObjectMeta: metav1.ObjectMeta{
						Annotations: map[string]string{
							"run.googleapis.com/execution-environment": spec.Spec.GCP.CloudRun.ExecutionEnvironment,
							"autoscaling.knative.dev/minScale":         strconv.FormatInt(int64(spec.Spec.Autoscaling.MinReplicas), 10),
							"autoscaling.knative.dev/maxScale":         strconv.FormatInt(int64(spec.Spec.Autoscaling.MaxReplicas), 10),
						},
					},
					Spec: servingv1.RevisionSpec{
						PodSpec: corev1.PodSpec{
							ServiceAccountName: spec.Spec.ServiceAccountName,
							Containers:         []corev1.Container{containerForSpec(spec.Spec)},
						},
						ContainerConcurrency: &concurrency,
					},
				},
			},
			RouteSpec: servingv1.RouteSpec{
				Traffic: []servingv1.TrafficTarget{{
					LatestRevision: &trueValue,
					Percent:        &trafficPercent,
				}},
			},
		},
	}
	if spec.Spec.GCP.CloudRun.Public {
		svc.Annotations["run.googleapis.com/invoker-iam-disabled"] = "true"
	}
	return marshalManifest(svc)
}

func RenderKubernetes(spec bifrostv1alpha1.Service) ([]byte, error) {
	labels := map[string]string{
		"app.kubernetes.io/name": spec.Metadata.Name,
	}
	namespace := spec.Spec.Kubernetes.Namespace
	kubernetesServiceAccountName := spec.Metadata.Name

	serviceAccount := corev1.ServiceAccount{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "v1",
			Kind:       "ServiceAccount",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      kubernetesServiceAccountName,
			Namespace: namespace,
			Annotations: map[string]string{
				"iam.gke.io/gcp-service-account": spec.Spec.ServiceAccountName,
			},
		},
	}

	deploy := appsv1.Deployment{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "apps/v1",
			Kind:       "Deployment",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      spec.Metadata.Name,
			Namespace: namespace,
		},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: labels,
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},
				Spec: corev1.PodSpec{
					ServiceAccountName: kubernetesServiceAccountName,
					Containers:         []corev1.Container{containerForSpec(spec.Spec)},
				},
			},
		},
	}

	minReplicas := spec.Spec.Autoscaling.MinReplicas
	if minReplicas < 1 {
		minReplicas = 1
	}
	hpa := autoscalingv2.HorizontalPodAutoscaler{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "autoscaling/v2",
			Kind:       "HorizontalPodAutoscaler",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      spec.Metadata.Name,
			Namespace: namespace,
		},
		Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
			ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
				APIVersion: "apps/v1",
				Kind:       "Deployment",
				Name:       spec.Metadata.Name,
			},
			MinReplicas: &minReplicas,
			MaxReplicas: spec.Spec.Autoscaling.MaxReplicas,
			Metrics: []autoscalingv2.MetricSpec{{
				Type: autoscalingv2.ResourceMetricSourceType,
				Resource: &autoscalingv2.ResourceMetricSource{
					Name: corev1.ResourceCPU,
					Target: autoscalingv2.MetricTarget{
						Type:               autoscalingv2.UtilizationMetricType,
						AverageUtilization: int32Ptr(spec.Spec.Autoscaling.TargetCPUUtilization),
					},
				},
			}},
		},
	}

	service := corev1.Service{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "v1",
			Kind:       "Service",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      spec.Metadata.Name,
			Namespace: namespace,
		},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceType(spec.Spec.Kubernetes.ServiceType),
			Selector: labels,
			Ports: []corev1.ServicePort{{
				Name:       "http",
				Port:       spec.Spec.Port,
				TargetPort: intstr.FromInt32(spec.Spec.Port),
			}},
		},
	}

	serviceAccountYAML, err := marshalManifest(serviceAccount)
	if err != nil {
		return nil, err
	}
	deployYAML, err := marshalManifest(deploy)
	if err != nil {
		return nil, err
	}
	hpaYAML, err := marshalManifest(hpa)
	if err != nil {
		return nil, err
	}
	serviceYAML, err := marshalManifest(service)
	if err != nil {
		return nil, err
	}

	var out bytes.Buffer
	out.Write(serviceAccountYAML)
	out.WriteString("---\n")
	out.Write(deployYAML)
	out.WriteString("---\n")
	out.Write(hpaYAML)
	out.WriteString("---\n")
	out.Write(serviceYAML)
	return out.Bytes(), nil
}

func RenderTerraform(spec bifrostv1alpha1.Service, projectExpr string) ([]byte, error) {
	useProjectOverride := projectExpr != ""
	if projectExpr == "" {
		projectExpr = spec.Spec.GCP.ProjectID
	}
	projectTraversal, err := traversalForExpr(projectExpr)
	if err != nil && useProjectOverride {
		return nil, fmt.Errorf("invalid project expression %q: %w", projectExpr, err)
	}
	accountID, err := accountIDFromEmail(spec.Spec.ServiceAccountName)
	if err != nil {
		return nil, err
	}
	kubernetesServiceAccountName := spec.Metadata.Name
	namespace := spec.Spec.Kubernetes.Namespace
	serviceAccountResourceName := terraformIdentifier(accountID)
	workloadIdentityResourceName := terraformIdentifier(accountID + "_workload_identity")
	serviceAccountTraversal, err := traversalForExpr("google_service_account." + serviceAccountResourceName + ".name")
	if err != nil {
		return nil, err
	}

	file := hclwrite.NewEmptyFile()
	body := file.Body()

	body.AppendUnstructuredTokens(hclwrite.Tokens{
		{Type: hclsyntax.TokenComment, Bytes: []byte("# Generated by bifrost.\n")},
		{Type: hclsyntax.TokenComment, Bytes: []byte("# Supporting runtime identity for " + spec.Metadata.Name + ".\n")},
	})
	body.AppendNewline()

	serviceAccountBlock := body.AppendNewBlock("resource", []string{"google_service_account", serviceAccountResourceName})
	serviceAccountBody := serviceAccountBlock.Body()
	setTerraformProject(serviceAccountBody, "project", projectExpr, projectTraversal, useProjectOverride)
	serviceAccountBody.SetAttributeValue("account_id", cty.StringVal(accountID))
	serviceAccountBody.SetAttributeValue("display_name", cty.StringVal("Runtime identity for "+spec.Metadata.Name))

	body.AppendNewline()

	workloadIdentityBlock := body.AppendNewBlock("resource", []string{"google_service_account_iam_member", workloadIdentityResourceName})
	workloadIdentityBody := workloadIdentityBlock.Body()
	workloadIdentityBody.SetAttributeTraversal("service_account_id", serviceAccountTraversal)
	workloadIdentityBody.SetAttributeValue("role", cty.StringVal("roles/iam.workloadIdentityUser"))
	setTerraformWorkloadIdentityMember(workloadIdentityBody, "member", projectExpr, projectTraversal, namespace, kubernetesServiceAccountName, useProjectOverride)

	return hclwrite.Format(file.Bytes()), nil
}

func containerForSpec(spec bifrostv1alpha1.Spec) corev1.Container {
	resources := *spec.Resources.DeepCopy()
	return corev1.Container{
		Name:  "app",
		Image: spec.Image,
		Args:  slicesClone(spec.Args),
		Ports: []corev1.ContainerPort{{
			ContainerPort: spec.Port,
		}},
		Resources:     resources,
		StartupProbe:  httpGetProbe(spec.Probes.StartupPath, spec.Port),
		LivenessProbe: httpGetProbe(spec.Probes.LivenessPath, spec.Port),
	}
}

func httpGetProbe(path string, port int32) *corev1.Probe {
	if path == "" {
		return nil
	}
	return &corev1.Probe{
		ProbeHandler: corev1.ProbeHandler{
			HTTPGet: &corev1.HTTPGetAction{
				Path: path,
				Port: intstr.FromInt32(port),
			},
		},
	}
}

func marshalManifest(obj any) ([]byte, error) {
	raw, err := yaml.Marshal(obj)
	if err != nil {
		return nil, err
	}
	var manifest map[string]any
	if err := yaml.Unmarshal(raw, &manifest); err != nil {
		return nil, err
	}
	delete(manifest, "status")
	return yaml.Marshal(manifest)
}

func accountIDFromEmail(email string) (string, error) {
	local, _, ok := strings.Cut(strings.TrimSpace(email), "@")
	if !ok || local == "" {
		return "", fmt.Errorf("invalid service account email %q", email)
	}
	if len(local) < 6 || len(local) > 30 {
		return "", fmt.Errorf("account ID %q must be between 6 and 30 characters", local)
	}
	return local, nil
}

func terraformIdentifier(name string) string {
	var out strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			out.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			out.WriteRune(r + ('a' - 'A'))
		case r == '-', r == '.', r == '/', r == '_':
			out.WriteByte('_')
		}
	}
	if out.Len() == 0 {
		return "service"
	}
	result := out.String()
	if result[0] >= '0' && result[0] <= '9' {
		return "service_" + result
	}
	return result
}

func slicesClone(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	out := make([]string, len(in))
	copy(out, in)
	return out
}

func int32Ptr(v int32) *int32 {
	return &v
}

func setTerraformProject(body *hclwrite.Body, name, project string, traversal hcl.Traversal, useOverride bool) {
	if useOverride {
		body.SetAttributeTraversal(name, traversal)
		return
	}
	body.SetAttributeValue(name, cty.StringVal(project))
}

func setTerraformWorkloadIdentityMember(body *hclwrite.Body, name, project string, traversal hcl.Traversal, namespace, serviceAccountName string, useOverride bool) {
	if useOverride {
		body.SetAttributeRaw(name, hclwrite.TokensForFunctionCall(
			"format",
			hclwrite.TokensForValue(cty.StringVal("serviceAccount:%s.svc.id.goog[%s/%s]")),
			hclwrite.TokensForTraversal(traversal),
			hclwrite.TokensForValue(cty.StringVal(namespace)),
			hclwrite.TokensForValue(cty.StringVal(serviceAccountName)),
		))
		return
	}
	body.SetAttributeValue(
		name,
		cty.StringVal(fmt.Sprintf("serviceAccount:%s.svc.id.goog[%s/%s]", project, namespace, serviceAccountName)),
	)
}

func traversalForExpr(expr string) (hcl.Traversal, error) {
	parts := strings.Split(expr, ".")
	if len(parts) == 0 || parts[0] == "" {
		return nil, fmt.Errorf("expression must be a dot-separated traversal")
	}

	traversal := hcl.Traversal{
		hcl.TraverseRoot{Name: parts[0]},
	}
	for _, part := range parts[1:] {
		if part == "" {
			return nil, fmt.Errorf("expression must be a dot-separated traversal")
		}
		traversal = append(traversal, hcl.TraverseAttr{Name: part})
	}
	return traversal, nil
}
