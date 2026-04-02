package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"path"
	"sort"
	"strconv"
	"strings"

	bifrostv1alpha1 "github.com/arkeros/senku/bifrost/pkg/api/v1alpha1"
	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/zclconf/go-cty/cty"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	servingv1 "knative.dev/serving/pkg/apis/serving/v1"
	"sigs.k8s.io/yaml"
)

func RenderCloudRun(spec bifrostv1alpha1.Workload) ([]byte, error) {
	switch spec.Kind {
	case bifrostv1alpha1.KindService:
		return renderCloudRunService(spec)
	case bifrostv1alpha1.KindCronJob:
		return renderCloudRunCronJob(spec)
	default:
		return nil, fmt.Errorf("unsupported kind %q", spec.Kind)
	}
}

func renderCloudRunService(spec bifrostv1alpha1.Workload) ([]byte, error) {
	trueValue := true
	trafficPercent := int64(100)
	concurrency := spec.Spec.Autoscaling.Concurrency
	resolved := resolveSecretFiles(spec.Spec.GCP.ProjectID, spec.Spec.SecretFiles)

	svc := servingv1.Service{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "serving.knative.dev/v1",
			Kind:       "Service",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      spec.Metadata.Name,
			Namespace: spec.Spec.GCP.ProjectNumber,
			Annotations: map[string]string{
				"run.googleapis.com/ingress": spec.Spec.GCP.CloudRun.Ingress,
			},
			Labels: mergeStringMaps(spec.Metadata.Labels, map[string]string{
				"cloud.googleapis.com/location": spec.Spec.GCP.Region,
			}),
		},
		Spec: servingv1.ServiceSpec{
			ConfigurationSpec: servingv1.ConfigurationSpec{
				Template: servingv1.RevisionTemplateSpec{
					ObjectMeta: metav1.ObjectMeta{
						Annotations: mergeStringMaps(cloudRunTemplateAnnotations(spec), map[string]string{
							"autoscaling.knative.dev/minScale": strconv.FormatInt(int64(spec.Spec.Autoscaling.MinReplicas), 10),
							"autoscaling.knative.dev/maxScale": strconv.FormatInt(int64(spec.Spec.Autoscaling.MaxReplicas), 10),
						}),
					},
					Spec: servingv1.RevisionSpec{
						PodSpec: corev1.PodSpec{
							ServiceAccountName: spec.Spec.ServiceAccountName,
							Containers:         []corev1.Container{containerForSpec(spec.Spec, resolved.mounts, true, true, false)},
							Volumes:            resolved.volumes,
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

func renderCloudRunCronJob(spec bifrostv1alpha1.Workload) ([]byte, error) {
	resolved := resolveSecretFiles(spec.Spec.GCP.ProjectID, spec.Spec.SecretFiles)
	jobSpec := map[string]any{
		"apiVersion": "run.googleapis.com/v1",
		"kind":       "Job",
		"metadata": map[string]any{
			"name":      spec.Metadata.Name,
			"namespace": spec.Spec.GCP.ProjectNumber,
			"labels": mergeStringMaps(spec.Metadata.Labels, map[string]string{
				"cloud.googleapis.com/location": spec.Spec.GCP.Region,
			}),
		},
		"spec": map[string]any{
			"template": map[string]any{
				"spec": map[string]any{
					"parallelism": spec.Spec.Job.Parallelism,
					"taskCount":   spec.Spec.Job.Completions,
					"template": map[string]any{
						"spec": map[string]any{
							"containers":         []corev1.Container{containerForSpec(spec.Spec, resolved.mounts, false, false, false)},
							"maxRetries":         spec.Spec.Job.MaxRetries,
							"timeoutSeconds":     strconv.FormatInt(spec.Spec.Job.TimeoutSeconds, 10),
							"serviceAccountName": spec.Spec.ServiceAccountName,
						},
					},
				},
			},
		},
	}
	templateMetadataAnnotations := cloudRunTemplateAnnotations(spec)
	if len(templateMetadataAnnotations) > 0 {
		jobSpec["spec"].(map[string]any)["template"].(map[string]any)["metadata"] = map[string]any{
			"annotations": templateMetadataAnnotations,
		}
	}
	templateSpec := jobSpec["spec"].(map[string]any)["template"].(map[string]any)["spec"].(map[string]any)["template"].(map[string]any)["spec"].(map[string]any)
	if len(resolved.volumes) > 0 {
		templateSpec["volumes"] = resolved.volumes
	}
	return marshalManifest(jobSpec)
}

func RenderKubernetes(spec bifrostv1alpha1.Workload) ([]byte, error) {
	switch spec.Kind {
	case bifrostv1alpha1.KindService:
		return renderKubernetesService(spec)
	case bifrostv1alpha1.KindCronJob:
		return renderKubernetesCronJob(spec)
	default:
		return nil, fmt.Errorf("unsupported kind %q", spec.Kind)
	}
}

func renderKubernetesService(spec bifrostv1alpha1.Workload) ([]byte, error) {
	labels := map[string]string{
		"app.kubernetes.io/name": spec.Metadata.Name,
	}
	namespace := spec.Spec.Kubernetes.Namespace
	kubernetesServiceAccountName := spec.Metadata.Name
	resolved := resolveSecretFiles(spec.Spec.GCP.ProjectID, spec.Spec.SecretFiles)

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
				Spec: podSpecWithSecurityContext(corev1.PodSpec{
					ServiceAccountName: kubernetesServiceAccountName,
					Containers:         []corev1.Container{containerForSpec(spec.Spec, resolved.mounts, true, true, true)},
					Volumes:            resolved.volumes,
				}),
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
	secretsYAML, err := secretManifests(spec.Spec.GCP.ProjectID, namespace, spec.Spec.SecretFiles)
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
	out.Write(secretsYAML)
	out.Write(deployYAML)
	out.WriteString("---\n")
	out.Write(hpaYAML)
	out.WriteString("---\n")
	out.Write(serviceYAML)
	return out.Bytes(), nil
}

func renderKubernetesCronJob(spec bifrostv1alpha1.Workload) ([]byte, error) {
	labels := map[string]string{
		"app.kubernetes.io/name": spec.Metadata.Name,
	}
	namespace := spec.Spec.Kubernetes.Namespace
	kubernetesServiceAccountName := spec.Metadata.Name
	resolved := resolveSecretFiles(spec.Spec.GCP.ProjectID, spec.Spec.SecretFiles)
	parallelism := spec.Spec.Job.Parallelism
	completions := spec.Spec.Job.Completions
	maxRetries := spec.Spec.Job.MaxRetries
	timeoutSeconds := spec.Spec.Job.TimeoutSeconds

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

	cronJob := batchv1.CronJob{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "batch/v1",
			Kind:       "CronJob",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      spec.Metadata.Name,
			Namespace: namespace,
		},
		Spec: batchv1.CronJobSpec{
			Schedule: spec.Spec.Schedule.Cron,
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Parallelism:           &parallelism,
					Completions:           &completions,
					BackoffLimit:          &maxRetries,
					ActiveDeadlineSeconds: &timeoutSeconds,
					Template: corev1.PodTemplateSpec{
						ObjectMeta: metav1.ObjectMeta{
							Labels: labels,
						},
						Spec: podSpecWithSecurityContext(corev1.PodSpec{
							RestartPolicy:      corev1.RestartPolicyNever,
							ServiceAccountName: kubernetesServiceAccountName,
							Containers:         []corev1.Container{containerForSpec(spec.Spec, resolved.mounts, false, false, true)},
							Volumes:            resolved.volumes,
						}),
					},
				},
			},
		},
	}
	if spec.Spec.Schedule.TimeZone != "" {
		cronJob.Spec.TimeZone = stringPtr(spec.Spec.Schedule.TimeZone)
	}

	serviceAccountYAML, err := marshalManifest(serviceAccount)
	if err != nil {
		return nil, err
	}
	secretsYAML, err := secretManifests(spec.Spec.GCP.ProjectID, namespace, spec.Spec.SecretFiles)
	if err != nil {
		return nil, err
	}
	cronJobYAML, err := marshalManifest(cronJob)
	if err != nil {
		return nil, err
	}

	var out bytes.Buffer
	out.Write(serviceAccountYAML)
	out.WriteString("---\n")
	out.Write(secretsYAML)
	out.Write(cronJobYAML)
	return out.Bytes(), nil
}

func RenderTerraform(spec bifrostv1alpha1.Workload) ([]byte, error) {
	switch spec.Kind {
	case bifrostv1alpha1.KindService:
		return renderTerraformService(spec)
	case bifrostv1alpha1.KindCronJob:
		return renderTerraformCronJob(spec)
	default:
		return nil, fmt.Errorf("unsupported kind %q", spec.Kind)
	}
}

func renderTerraformService(spec bifrostv1alpha1.Workload) ([]byte, error) {
	projectID := spec.Spec.GCP.ProjectID
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

	serviceAccountBlock := body.AppendNewBlock("resource", []string{"google_service_account", serviceAccountResourceName})
	serviceAccountBody := serviceAccountBlock.Body()
	serviceAccountBody.SetAttributeValue("project", cty.StringVal(projectID))
	serviceAccountBody.SetAttributeValue("account_id", cty.StringVal(accountID))
	serviceAccountBody.SetAttributeValue("display_name", cty.StringVal("Runtime identity for "+spec.Metadata.Name))

	body.AppendNewline()

	workloadIdentityBlock := body.AppendNewBlock("resource", []string{"google_service_account_iam_member", workloadIdentityResourceName})
	workloadIdentityBody := workloadIdentityBlock.Body()
	workloadIdentityBody.SetAttributeTraversal("service_account_id", serviceAccountTraversal)
	workloadIdentityBody.SetAttributeValue("role", cty.StringVal("roles/iam.workloadIdentityUser"))
	workloadIdentityBody.SetAttributeValue(
		"member",
		cty.StringVal(fmt.Sprintf("serviceAccount:%s.svc.id.goog[%s/%s]", projectID, namespace, kubernetesServiceAccountName)),
	)

	return hclwrite.Format(file.Bytes()), nil
}

func renderTerraformCronJob(spec bifrostv1alpha1.Workload) ([]byte, error) {
	projectID := spec.Spec.GCP.ProjectID
	runtimeAccountID, err := accountIDFromEmail(spec.Spec.ServiceAccountName)
	if err != nil {
		return nil, err
	}
	kubernetesServiceAccountName := spec.Metadata.Name
	namespace := spec.Spec.Kubernetes.Namespace
	runtimeResourceName := terraformIdentifier(runtimeAccountID)
	workloadIdentityResourceName := terraformIdentifier(runtimeAccountID + "_workload_identity")
	runtimeServiceAccountTraversal, err := traversalForExpr("google_service_account." + runtimeResourceName + ".name")
	if err != nil {
		return nil, err
	}
	schedulerAccountID, err := prefixedAccountID("sch-", spec.Metadata.Name)
	if err != nil {
		return nil, err
	}
	schedulerResourceName := terraformIdentifier(schedulerAccountID)
	schedulerEmailTraversal, err := traversalForExpr("google_service_account." + schedulerResourceName + ".email")
	if err != nil {
		return nil, err
	}

	file := hclwrite.NewEmptyFile()
	body := file.Body()

	runtimeServiceAccountBlock := body.AppendNewBlock("resource", []string{"google_service_account", runtimeResourceName})
	runtimeServiceAccountBody := runtimeServiceAccountBlock.Body()
	runtimeServiceAccountBody.SetAttributeValue("project", cty.StringVal(projectID))
	runtimeServiceAccountBody.SetAttributeValue("account_id", cty.StringVal(runtimeAccountID))
	runtimeServiceAccountBody.SetAttributeValue("display_name", cty.StringVal("Runtime identity for "+spec.Metadata.Name))

	body.AppendNewline()

	workloadIdentityBlock := body.AppendNewBlock("resource", []string{"google_service_account_iam_member", workloadIdentityResourceName})
	workloadIdentityBody := workloadIdentityBlock.Body()
	workloadIdentityBody.SetAttributeTraversal("service_account_id", runtimeServiceAccountTraversal)
	workloadIdentityBody.SetAttributeValue("role", cty.StringVal("roles/iam.workloadIdentityUser"))
	workloadIdentityBody.SetAttributeValue(
		"member",
		cty.StringVal(fmt.Sprintf("serviceAccount:%s.svc.id.goog[%s/%s]", projectID, namespace, kubernetesServiceAccountName)),
	)

	body.AppendNewline()

	schedulerServiceAccountBlock := body.AppendNewBlock("resource", []string{"google_service_account", schedulerResourceName})
	schedulerServiceAccountBody := schedulerServiceAccountBlock.Body()
	schedulerServiceAccountBody.SetAttributeValue("project", cty.StringVal(projectID))
	schedulerServiceAccountBody.SetAttributeValue("account_id", cty.StringVal(schedulerAccountID))
	schedulerServiceAccountBody.SetAttributeValue("display_name", cty.StringVal("Cloud Scheduler invoker for "+spec.Metadata.Name))

	body.AppendNewline()

	schedulerInvokerBlock := body.AppendNewBlock("resource", []string{"google_project_iam_member", terraformIdentifier(schedulerAccountID + "_run_invoker")})
	schedulerInvokerBody := schedulerInvokerBlock.Body()
	schedulerInvokerBody.SetAttributeValue("project", cty.StringVal(projectID))
	schedulerInvokerBody.SetAttributeValue("role", cty.StringVal("roles/run.invoker"))
	schedulerInvokerBody.SetAttributeRaw(
		"member",
		hclwrite.TokensForFunctionCall(
			"format",
			hclwrite.TokensForValue(cty.StringVal("serviceAccount:%s")),
			hclwrite.TokensForTraversal(schedulerEmailTraversal),
		),
	)

	body.AppendNewline()

	schedulerBlock := body.AppendNewBlock("resource", []string{"google_cloud_scheduler_job", terraformIdentifier(spec.Metadata.Name + "_schedule")})
	schedulerBody := schedulerBlock.Body()
	schedulerBody.SetAttributeValue("project", cty.StringVal(projectID))
	schedulerBody.SetAttributeValue("name", cty.StringVal(spec.Metadata.Name))
	schedulerBody.SetAttributeValue("region", cty.StringVal(spec.Spec.GCP.Region))
	schedulerBody.SetAttributeValue("schedule", cty.StringVal(spec.Spec.Schedule.Cron))
	if spec.Spec.Schedule.TimeZone != "" {
		schedulerBody.SetAttributeValue("time_zone", cty.StringVal(spec.Spec.Schedule.TimeZone))
	}
	if spec.Spec.GCP.CloudScheduler.AttemptDeadlineSeconds > 0 {
		schedulerBody.SetAttributeValue("attempt_deadline", cty.StringVal(fmt.Sprintf("%ds", spec.Spec.GCP.CloudScheduler.AttemptDeadlineSeconds)))
	}
	if spec.Spec.GCP.CloudScheduler.RetryCount > 0 {
		retryConfig := schedulerBody.AppendNewBlock("retry_config", nil)
		retryConfig.Body().SetAttributeValue("retry_count", cty.NumberIntVal(int64(spec.Spec.GCP.CloudScheduler.RetryCount)))
	}
	httpTarget := schedulerBody.AppendNewBlock("http_target", nil)
	httpTargetBody := httpTarget.Body()
	httpTargetBody.SetAttributeValue("http_method", cty.StringVal("POST"))
	httpTargetBody.SetAttributeValue("uri", cty.StringVal(fmt.Sprintf("https://run.googleapis.com/v2/projects/%s/locations/%s/jobs/%s:run", projectID, spec.Spec.GCP.Region, spec.Metadata.Name)))
	httpTargetBody.SetAttributeRaw("body", hclwrite.TokensForFunctionCall("base64encode", hclwrite.TokensForValue(cty.StringVal("{}"))))
	httpTargetBody.SetAttributeValue("headers", cty.MapVal(map[string]cty.Value{
		"Content-Type": cty.StringVal("application/json"),
	}))
	oauthToken := httpTargetBody.AppendNewBlock("oauth_token", nil)
	oauthToken.Body().SetAttributeTraversal("service_account_email", schedulerEmailTraversal)

	return hclwrite.Format(file.Bytes()), nil
}

func containerForSpec(spec bifrostv1alpha1.Spec, volumeMounts []corev1.VolumeMount, includePorts bool, includeProbes bool, includeSecurityContext bool) corev1.Container {
	resources := *spec.Resources.DeepCopy()
	container := corev1.Container{
		Name:         "app",
		Image:        spec.Image,
		Args:         slicesClone(spec.Args),
		Resources:    resources,
		VolumeMounts: volumeMounts,
	}
	if includeSecurityContext {
		trueVal := true
		falseVal := false
		container.SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot:             &trueVal,
			AllowPrivilegeEscalation: &falseVal,
			ReadOnlyRootFilesystem:   &trueVal,
			Capabilities: &corev1.Capabilities{
				Drop: []corev1.Capability{"ALL"},
			},
			SeccompProfile: &corev1.SeccompProfile{
				Type: corev1.SeccompProfileTypeRuntimeDefault,
			},
		}
	}
	if includePorts && spec.Port > 0 {
		container.Ports = []corev1.ContainerPort{{
			ContainerPort: spec.Port,
		}}
	}
	if includeProbes {
		container.StartupProbe = httpGetProbe(spec.Probes.StartupPath, spec.Port)
		container.LivenessProbe = httpGetProbe(spec.Probes.LivenessPath, spec.Port)
	}
	return container
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

type resolvedSecrets struct {
	volumes []corev1.Volume
	mounts  []corev1.VolumeMount
}

func resolveSecretFiles(projectID string, secretFiles []bifrostv1alpha1.SecretFile) resolvedSecrets {
	if len(secretFiles) == 0 {
		return resolvedSecrets{}
	}
	type secretData struct {
		name string
		data map[string]string // version → base64(gcpsm ref)
	}
	type mountGroup struct {
		ukey      string
		mountPath string
		items     []corev1.KeyToPath
	}
	secrets := map[string]*secretData{}   // keyed by uniqueKey (project/name)
	var secretOrder []string
	groups := map[string]*mountGroup{}
	var groupOrder []string
	for _, sf := range secretFiles {
		ukey := sf.UniqueKey(projectID)
		proj, name, version := sf.ParseSecret(projectID)
		sd, ok := secrets[ukey]
		if !ok {
			sd = &secretData{name: name, data: map[string]string{}}
			secrets[ukey] = sd
			secretOrder = append(secretOrder, ukey)
		}
		sd.data[version] = base64.StdEncoding.EncodeToString([]byte(
			fmt.Sprintf("${gcpsm:///projects/%s/secrets/%s/versions/%s}", proj, name, version)))

		dir := path.Dir(sf.Path)
		gkey := ukey + ":" + dir
		g, ok := groups[gkey]
		if !ok {
			g = &mountGroup{ukey: ukey, mountPath: dir}
			groups[gkey] = g
			groupOrder = append(groupOrder, gkey)
		}
		g.items = append(g.items, corev1.KeyToPath{
			Key:  version,
			Path: path.Base(sf.Path),
		})
	}
	// Compute suffixed names from secret data
	suffixedNames := map[string]string{}
	for _, ukey := range secretOrder {
		sd := secrets[ukey]
		suffixedNames[ukey] = sd.name + "-" + hashSecretData(sd.data)
	}
	var res resolvedSecrets
	for _, gkey := range groupOrder {
		g := groups[gkey]
		sname := suffixedNames[g.ukey]
		res.volumes = append(res.volumes, corev1.Volume{
			Name: sname,
			VolumeSource: corev1.VolumeSource{
				Secret: &corev1.SecretVolumeSource{
					SecretName: sname,
					Items:      g.items,
				},
			},
		})
		res.mounts = append(res.mounts, corev1.VolumeMount{
			Name:      sname,
			MountPath: g.mountPath,
		})
	}
	return res
}

func secretManifests(projectID, namespace string, secretFiles []bifrostv1alpha1.SecretFile) ([]byte, error) {
	if len(secretFiles) == 0 {
		return nil, nil
	}
	type secretEntry struct {
		name string
		data map[string]string
	}
	seen := map[string]*secretEntry{}
	var order []string
	for _, sf := range secretFiles {
		ukey := sf.UniqueKey(projectID)
		proj, name, version := sf.ParseSecret(projectID)
		e, ok := seen[ukey]
		if !ok {
			e = &secretEntry{name: name, data: map[string]string{}}
			seen[ukey] = e
			order = append(order, ukey)
		}
		e.data[version] = base64.StdEncoding.EncodeToString([]byte(
			fmt.Sprintf("${gcpsm:///projects/%s/secrets/%s/versions/%s}", proj, name, version)))
	}
	var out bytes.Buffer
	for _, ukey := range order {
		e := seen[ukey]
		suffixed := e.name + "-" + hashSecretData(e.data)
		secret := map[string]any{
			"apiVersion": "v1",
			"kind":       "Secret",
			"metadata": map[string]any{
				"name":      suffixed,
				"namespace": namespace,
			},
			"data": e.data,
		}
		b, err := marshalManifest(secret)
		if err != nil {
			return nil, err
		}
		out.Write(b)
		out.WriteString("---\n")
	}
	return out.Bytes(), nil
}

func hashSecretData(data map[string]string) string {
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	h := sha256.New()
	for _, k := range keys {
		h.Write([]byte(k))
		h.Write([]byte{0})
		h.Write([]byte(data[k]))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:10]
}

func mergeStringMaps(base map[string]string, extra map[string]string) map[string]string {
	if len(base) == 0 && len(extra) == 0 {
		return nil
	}
	out := map[string]string{}
	for k, v := range base {
		if v != "" {
			out[k] = v
		}
	}
	for k, v := range extra {
		if v != "" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func cloudRunTemplateAnnotations(spec bifrostv1alpha1.Workload) map[string]string {
	return mergeStringMaps(nil, map[string]string{
		"run.googleapis.com/execution-environment": "gen2",
		"run.googleapis.com/secrets":               cloudRunSecretsAnnotation(spec.Spec.GCP.ProjectID, spec.Spec.SecretFiles),
	})
}

func cloudRunSecretsAnnotation(defaultProject string, secretFiles []bifrostv1alpha1.SecretFile) string {
	seen := map[string]bool{}
	var parts []string
	for _, sf := range secretFiles {
		ukey := sf.UniqueKey(defaultProject)
		proj, name, _ := sf.ParseSecret(defaultProject)
		if proj == defaultProject || seen[ukey] {
			continue
		}
		seen[ukey] = true
		parts = append(parts, fmt.Sprintf("%s:projects/%s/secrets/%s", name, proj, name))
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, ",")
}

func prefixedAccountID(prefix, name string) (string, error) {
	return bifrostv1alpha1.DefaultServiceAccountAccountID(prefix, name)
}

func int32Ptr(v int32) *int32 {
	return &v
}

func podSpecWithSecurityContext(spec corev1.PodSpec) corev1.PodSpec {
	trueVal := true
	spec.SecurityContext = &corev1.PodSecurityContext{
		RunAsNonRoot: &trueVal,
		SeccompProfile: &corev1.SeccompProfile{
			Type: corev1.SeccompProfileTypeRuntimeDefault,
		},
	}
	return spec
}

func stringPtr(v string) *string {
	return &v
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
