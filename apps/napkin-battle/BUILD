load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("@rules_img//img:push.bzl", "image_push")
load("@terraform.bzl//:gcp.bzl", "google_provider", "service_account")
load("@terraform.bzl", "output")
load("//devtools/bifrost/modules:cloudrun.bzl", "service_cloudrun")
load("//devtools/build/react_component:react_app.bzl", "react_app", "route")
load("//devtools/build/react_component:react_static_layer.bzl", "react_static_layer")
load("//devtools/build/tools/tf:render.bzl", "IMAGE_URI", "tf_root_with_image")
load(
    "//infra/cloud/gcp/gar:defs.bzl",
    "GAR_REGISTRY",
    "GAR_REPOSITORY_PREFIX",
)
load("//oci:frontend_image.bzl", "frontend_images_all_arch")
load("//oci:vex.bzl", "vex_document")
load("//oci/distroless/common:debian_fixed_vex.bzl", "NGINX_FIXED_VEX_STATEMENTS")
load("//oci/distroless/common:variables.bzl", "DEBIAN_WONTFIX_CVES")
load(
    ":defs.bzl",
    "PROJECT",
    "REGION",
    "SERVICE_NAME",
)

react_app(
    name = "app",
    browser_deps = [
        "//:browser_modules/_react",
        "//:browser_modules/react-router",
        "//:browser_modules/cookie",
        "//:browser_modules/set-cookie-parser",
        "//:browser_modules/@stylexjs/stylex",
        "//:browser_modules/messageformat",
        "//:browser_modules/@panellet/i18n-runtime",
    ],
    error_component = "//apps/napkin-battle/components/AppError",
    html_template = "index.html.tpl",
    jit_open_props = True,
    layout = "//apps/napkin-battle/components/Layout",
    # Spanish is the source locale: the game was designed on a Spanish napkin
    # and every other catalog has to match its key set exactly.
    locales = [
        "ca",
        "en",
        "es",
    ],
    routes = [
        route(
            component = "//apps/napkin-battle/pages/Play",
            path = "/",
        ),
        route(
            component = "//apps/napkin-battle/pages/HowToPlay",
            path = "how-to-play",
        ),
        route(
            component = "//apps/napkin-battle/pages/NotFound",
            path = "*",
        ),
    ],
    source_locale = "es",
    visibility = ["//visibility:private"],
)

build_test(
    name = "app_build_test",
    targets = [
        ":app",
        ":app_bundle",
        ":app_devserver",
        ":app_html",
        ":app_styles",
    ],
)

# ---------------------------------------------------------------------------
# Image: the built napkin on nginx.
#
# Two tars (webroot, nginx conf) so a cache-header tweak does not invalidate
# the layer holding the bundle, and vice versa.
# ---------------------------------------------------------------------------

react_static_layer(
    name = "app_layer",
    app = ":app",
)

# Inherited from the nginx base: the nginx.org .deb this image serves
# from is flagged against Debian's own nginx package. See
# //oci/distroless/common:debian_fixed_vex.bzl.
vex_document(
    name = "vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/apps/napkin-battle/BUILD",
    statements = NGINX_FIXED_VEX_STATEMENTS,
    timestamp = "2026-08-01T00:00:00Z",
)

frontend_images_all_arch(
    name = "image",
    ignore_cves = DEBIAN_WONTFIX_CVES,
    statics_layer = [
        ":app_layer_statics",
        ":app_layer_conf",
        "//apps/napkin-battle/icons:icons_layer",
    ],
    vex = [":vex"],
)

# GAR is the Cloud Run deploy substrate: IAM-trusted, not cosign-trusted, and
# out of `mirror_push` scope (ADR 0006) because nothing outside this project
# consumes it. `aspect apply` re-pushes the same digest via the pre_apply hook
# that `tf_root_with_image` installs.
image_push(
    name = "image_push_gar",
    image = ":image",
    registry = GAR_REGISTRY,
    repository = GAR_REPOSITORY_PREFIX + "/" + SERVICE_NAME,
    stamp = "force",
    tag_list = [
        "latest",
        "{{.STABLE_MONOREPO_IMAGE_TAG_VERSION}}",
        "{{.STABLE_MONOREPO_SHORT_VERSION}}",
    ],
    tags = ["manual"],
)

# ---------------------------------------------------------------------------
# Terraform root: one Cloud Run service and the identity it runs as.
#
# `ingress = INTERNAL_LOAD_BALANCER` is not a preference — org policy on
# senku-prod (constraints/run.allowedIngress) allows only `internal` and
# `internal-and-cloud-load-balancing`, so a directly-reachable `*.run.app`
# URL is not on the table. `public = True` grants allUsers run.invoker
# because the LB's serverless NEG calls without an OIDC identity; the
# ingress filter, not IAM, is what keeps the service off the open internet.
#
# Until a backend in //infra/cloud/gcp/lb points at this service it is
# deployed but unreachable. See README.md for the exposure options.
# ---------------------------------------------------------------------------

sa = service_account(
    name = "napkin_battle",
    account_id = "svc-napkin-battle",
    display_name = "Runtime identity for the napkin-battle frontend",
    project = PROJECT,
)

napkin_service = service_cloudrun(
    name = "napkin_battle",
    # Sentinel replaced with the digest URI at Bazel build time; see
    # `tf_root_with_image.image_push`.
    image = IMAGE_URI,
    ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
    probes = {
        "startup_path": "/index.html",
        "liveness_path": "/index.html",
    },
    project = PROJECT,
    public = True,
    region = REGION,
    # No `resources`: Cloud Run already defaults to 1 CPU / 512Mi, which is
    # also the gen2 floor, so stating it would just be the platform default
    # written twice — and passing the block at all would read as a sizing
    # decision nobody made. nginx handing out a few hundred KB never comes
    # near the limit either way.
    #
    # Scale to zero, and cap at 2: there is nothing to keep warm, and a
    # static napkin has no traffic shape that a third instance would rescue.
    scaling = {
        "min": 0,
        "max": 2,
    },
    service_account_email = sa.email,
    service_name = SERVICE_NAME,
)

tf_root_with_image(
    name = "terraform",
    backend_bucket = "senku-prod-terraform-state",
    docs = [
        google_provider(project = PROJECT),
        sa,
        napkin_service,
        output(
            "service_uri",
            description = "Cloud Run `*.run.app` URL. Not reachable directly (ingress is LB-only); exposed for `gcloud` smoke tests.",
            value = napkin_service.uri,
        ),
        output(
            "service_account_email",
            description = "Runtime GSA. Grant any downstream IAM here.",
            value = sa.email,
        ),
    ],
    image_push = ":image_push_gar",
    providers = ["@terraform_providers//:google"],
    visibility = ["//visibility:public"],
)

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    visibility = ["//visibility:public"],
    deps = [],  # keep (consumed via load() in //infra/cloud/gcp/lb:defs.bzl — gazelle's bzl_library reverse-dep detection only reads BUILD files, not other .bzl, so without this the rule gets regenerated and visibility stripped)
)
