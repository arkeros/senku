# tfgen

Generate Terraform scaffolding for supporting runtime identity from deployment manifests.

Current scope:

- `serving.knative.dev/v1` `Service`
- Terraform for:
  - `google_service_account`

## Usage

Generate Terraform from the rendered Cloud Run manifest:

```bash
bazel build //oci/cmd/registry/k8s //tools/cmd/tfgen
bazel-bin/tools/cmd/tfgen/tfgen_/tfgen \
  -in bazel-bin/oci/cmd/registry/k8s/k8s.yaml
```

Or read from stdin:

```bash
cat bazel-bin/oci/cmd/registry/k8s/k8s.yaml | bazel-bin/tools/cmd/tfgen/tfgen_/tfgen
```

## Notes

- Unsupported manifest fields are ignored.
- Each supported service must declare `spec.template.spec.serviceAccountName` as a Google service account email.
- Shared service accounts produce a warning by default. Use `-strict` to fail instead.
- `tfgen` does not generate the Cloud Run service resource itself; deploy remains owned by the manifest and CI workflow.
