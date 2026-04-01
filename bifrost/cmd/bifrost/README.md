# bifrost

Generate platform artifacts from a single service spec.

Targets:

- Cloud Run Knative service YAML
- Kubernetes `Deployment` + `HorizontalPodAutoscaler` + `Service`
- Terraform for runtime `google_service_account`

Usage:

```bash
bifrost render cloudrun -f oci/cmd/registry/service.yaml
bifrost render k8s -f oci/cmd/registry/service.yaml
bifrost render terraform -f oci/cmd/registry/service.yaml
```

## Direnv

See the repo [Setup section](../../../README.md) for Bazelisk installation, `direnv`, `bazel run //tools:dev`, and `direnv allow`. The repo already exposes `bifrost` through `//tools:dev`; no custom shell wrapper is needed.

Example spec:

```yaml
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
```

## Design

`bifrost` exists because deployment manifests are a bad long-term source of truth for infrastructure. A Knative or Kubernetes manifest is already a platform-specific artifact. Reverse-engineering infra from those manifests works for a short time, but it couples the repo to the quirks of one target and makes shared intent hard to see.

The chosen model is:

1. A small, versioned service API under [`bifrost/pkg/api/v1alpha1`](../../pkg/api/v1alpha1).
2. One source of truth for workload intent.
3. Target-specific renderers that translate that intent into Cloud Run YAML, Kubernetes YAML, and Terraform.

This is intentionally closer to a small platform API than to a templating trick.

## Why A Custom Model

The main design decision is to model the service directly instead of inferring everything from Knative or Kubernetes objects.

Reasons:

- The same service spec should be able to render to multiple targets.
- Shared intent should be expressed once, not duplicated in several platform dialects.
- Platform-specific manifests should be outputs, not inputs.
- Infra generation should not depend on guessing from deployment syntax.

The current proof is the `registry` service:

- one `service.yaml`
- one Cloud Run render
- one Kubernetes render
- one Terraform render

If that stays coherent, the model is at the right abstraction level.

## API Package

The service API is defined in [`types.go`](../../pkg/api/v1alpha1/types.go), not in the CLI package.

That split is intentional:

- the schema is reusable by other tools
- the command is just a consumer
- versioning belongs with the API, not with the binary

This follows the same idea as packages like `k8s.io/api`: the types should be importable without dragging in CLI code.

One deliberate exception is `spec.resources`: it uses Kubernetes `core/v1.ResourceRequirements` directly. That is acceptable here because the repository already depends on Kubernetes APIs, the YAML shape is familiar, and the same resource contract is rendered to both Cloud Run and Kubernetes.

## Shared Intent Vs Target-Specific Fields

The spec is divided into two kinds of data:

- shared workload intent
- target-specific knobs

Shared intent:

- `image`
- `serviceAccountName`
- `args`
- `port`
- `resources.requests`
- `resources.limits`
- `probes`
- `autoscaling`

Target-specific knobs:

- `gcp.projectId`
- `gcp.cloudRun.region`
- `gcp.cloudRun.ingress`
- `gcp.cloudRun.executionEnvironment`
- `gcp.cloudRun.public`
- `kubernetes.serviceType`
- `kubernetes.namespace`

This separation is deliberate. Anything that means the same thing on both platforms should live once at the top level. Anything that only exists because a platform needs a special knob should stay under that target.

## Explicit Identity

`serviceAccountName` is required and must be a Google service account email.

This is a security decision, so `bifrost` does not invent it automatically. The identity must be visible in the source spec for review.

Why:

- runtime identity should be explicit
- deploy and infra ownership stay separate
- Terraform can create the GSA while deploy artifacts simply reference it
- the model avoids silent fallback to default service accounts

Identity is rendered differently by target:

- Cloud Run uses the declared GSA directly as `serviceAccountName`
- Kubernetes generates a KSA named after the service and annotates it with `iam.gke.io/gcp-service-account` for GKE Workload Identity
- Terraform creates the GSA and the `roles/iam.workloadIdentityUser` binding for that KSA

## Autoscaling Model

The `autoscaling` block is shared intent:

```yaml
autoscaling:
  min: 0
  max: 3
```

This is one of the most important design choices in the current model.

Why it is shared:

- `min` and `max` mean the same thing across Cloud Run and Kubernetes
- `concurrency` is workload-level intent for request handling
- `targetCPUUtilization` is autoscaling policy intent

Why it is not split into per-target fields:

- duplicated `minScale` and `minReplicas` drift easily
- duplicated `maxScale` and `maxReplicas` drift easily
- target-specific names are renderer concerns, not source-model concerns

Current mapping:

- Cloud Run:
  - `autoscaling.min` -> `autoscaling.knative.dev/minScale`
  - `autoscaling.max` -> `autoscaling.knative.dev/maxScale`
  - `autoscaling.concurrency` -> `containerConcurrency`
- Kubernetes:
  - `autoscaling.min` -> HPA `minReplicas`
  - `autoscaling.max` -> HPA `maxReplicas`
  - `autoscaling.targetCPUUtilization` -> HPA `averageUtilization`

Defaulted values:

- `autoscaling.concurrency` defaults to `80`
- `autoscaling.targetCPUUtilization` defaults to `80`

There is one intentional platform leak:

- Cloud Run can use `min = 0`
- Kubernetes HPA is rendered with `minReplicas >= 1`

So if `autoscaling.min` is `0`, the renderer preserves that for Cloud Run and clamps Kubernetes to `1`.

That is not ideal symmetry, but it is a real platform difference. Keeping one shared field is still better than duplicating the concept in the source model.

## Kubernetes Output

The Kubernetes renderer produces four objects:

- `ServiceAccount`
- `Deployment`
- `HorizontalPodAutoscaler`
- `Service`

The generated `ServiceAccount` is the Kubernetes-side identity. The `Deployment` uses that KSA, not the GSA email, and the KSA is annotated for GKE Workload Identity.

It intentionally does not set `Deployment.spec.replicas`. Scaling belongs to the HPA, not to a fixed replica count in the workload spec.

This is a deliberate design decision because fixed replicas and autoscaling are conflicting sources of truth.

## Cloud Run Output

The Cloud Run renderer produces a Knative `serving.knative.dev/v1 Service`.

It uses:

- Knative serving types for the generated object model
- Cloud Run-specific annotations for ingress, execution environment, and scaling
- GCP project-specific configuration from `gcp.projectId` and `gcp.cloudRun`

The choice to emit Knative YAML rather than call `gcloud` directly keeps deploy artifacts inspectable, reviewable, and compatible with the existing CI workflow.

## Terraform Output

The Terraform renderer is intentionally narrow.

It currently emits:

- `google_service_account`
- `google_service_account_iam_member` for GKE Workload Identity

It does not emit:

- `google_cloud_run_v2_service`
- `allUsers` invoker IAM
- custom domain resources
- DNS
- load balancers

Reason:

- the service deployment is already owned by deploy artifacts and CI
- edge/network resources need broader context than a single service spec
- identity is workload-local and safe to derive directly

This keeps ownership clean:

- `bifrost render cloudrun` or `bifrost render k8s` owns deploy artifacts
- `bifrost render terraform` owns supporting runtime identity

## Validation Philosophy

The schema validates required, security-relevant, and portability-critical fields early.

Examples:

- `metadata.name` is required
- `spec.image` is required
- `spec.serviceAccountName` is required
- `spec.serviceAccountName` must be a GSA email
- `spec.port` must be positive
- CPU and memory limits are required
- CPU and memory requests default to limits when omitted
- `gcp.projectId` is required
- `gcp.cloudRun.region` is required

Defaults are only applied for low-risk operational knobs:

- GCP Cloud Run ingress defaults to `all`
- GCP Cloud Run execution environment defaults to `gen2`
- Kubernetes service type defaults to `ClusterIP`
- Kubernetes namespace defaults to `default`
- scaling defaults fill in `max`, `concurrency`, and CPU target

The general rule is:

- default convenience settings
- require explicit security and identity settings

## Current Scope

This first version is intentionally small.

Supported service features:

- one container
- args
- one port
- startup and liveness HTTP probes
- resource limits
- runtime service account
- shared scaling policy
- Cloud Run and Kubernetes service exposure basics

Not modeled yet:

- environment variables
- secrets
- volumes
- sidecars
- cron jobs
- stateful workloads
- custom domains
- IAM role bindings beyond creating the runtime GSA

Those should be added only when the shared model is clear. The main design rule is to avoid stuffing platform-specific details into the top-level spec before they have a clear cross-target meaning.
