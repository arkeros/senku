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

# `jit_open_props` is off: this app draws to a canvas and its handful of DOM
# styles use literal values, so there are no Open Props custom properties to
# inject.
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
    error_component = "//apps/dino-meteor/components/AppError",
    html_template = "index.html.tpl",
    layout = "//apps/dino-meteor/components/Layout",
    locales = [
        "ca",
        "en",
        "es",
    ],
    routes = [
        route(
            component = "//apps/dino-meteor/pages/Play",
            path = "/",
        ),
        route(
            component = "//apps/dino-meteor/pages/NotFound",
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
    id = "https://github.com/arkeros/senku/blob/main/apps/dino-meteor/BUILD",
    statements = NGINX_FIXED_VEX_STATEMENTS,
    timestamp = "2026-08-01T00:00:00Z",
)

frontend_images_all_arch(
    name = "image",
    ignore_cves = DEBIAN_WONTFIX_CVES,
    statics_layer = [
        ":app_layer_statics",
        ":app_layer_conf",
    ],
    vex = [":vex"],
)

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

sa = service_account(
    name = "dino_meteor",
    account_id = "svc-dino-meteor",
    display_name = "Runtime identity for the dino-meteor frontend",
    project = PROJECT,
)

# Ingress is LB-only because org policy on senku-prod
# (constraints/run.allowedIngress) allows nothing else; `public = True` grants
# allUsers run.invoker since the LB's serverless NEG calls without an OIDC
# identity. No `resources`: Cloud Run's own default is 1 CPU / 512Mi, which is
# also the gen2 floor, so stating it would just repeat the platform default.
dino_service = service_cloudrun(
    name = "dino_meteor",
    image = IMAGE_URI,
    ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
    probes = {
        "startup_path": "/index.html",
        "liveness_path": "/index.html",
    },
    project = PROJECT,
    public = True,
    region = REGION,
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
        dino_service,
        output(
            "service_uri",
            description = "Cloud Run `*.run.app` URL. Not reachable directly (ingress is LB-only); exposed for `gcloud` smoke tests.",
            value = dino_service.uri,
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
