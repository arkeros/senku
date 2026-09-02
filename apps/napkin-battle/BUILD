load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("@rules_shell//shell:sh_test.bzl", "sh_test")
load("@terraform.bzl//:gcp.bzl", "google_provider")
load("@terraform.bzl", "output", "tf_root")
load("//devtools/bifrost/modules:staticsite.bzl", "site_gcs")
load("//devtools/build/react_component:react_app.bzl", "react_app", "route")
load("//devtools/build/react_component:react_static_layer.bzl", "react_static_layer")
load("//devtools/build/tools/tf:bucket_push.bzl", "bucket_push")
load("//devtools/build/tools/tf:render.bzl", "registry_push")
load("//infra/cloud/gcp/gar:defs.bzl", "REGISTRY")
load("//oci:frontend_image.bzl", "frontend_images_all_arch")
load(
    ":defs.bzl",
    "BUCKET_NAME",
    "PROJECT",
    "REGION",
    "SITE_NAME",
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

sh_test(
    name = "prerender_test",
    srcs = ["prerender_test.sh"],
    data = [
        ":app_html",
        ":app_route_how-to-play",
    ],
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
    # Named once: `:app_layer_extras` below is built from this same list,
    # so the icons cannot reach the image without also reaching the bucket.
    extra_srcs = ["//apps/napkin-battle/icons:icons"],
)

frontend_images_all_arch(
    name = "image",
    statics_layer = [
        ":app_layer_statics",
        ":app_layer_conf",
        ":app_layer_extras",
    ],
)

# GAR is IAM-trusted, not cosign-trusted, and out of `mirror_push` scope
# (ADR 0006) because nothing outside this project consumes it. Since the site
# moved to a bucket (ADR 0009) nothing runs this image; it is pushed so the
# deployed bytes stay traceable to a signed, SBOM'd artifact.
registry_push(
    name = "image_push_gar",
    image = ":image",
    registry = REGISTRY,
    repository = SITE_NAME,
)

# ---------------------------------------------------------------------------
# Terraform root: one bucket, and the public-read grant the LB needs to see
# into it. Nothing runs, so there is no ingress setting and no identity.
#
# Until a backend in //infra/cloud/gcp/lb points at this bucket it is
# deployed but unreachable. See README.md for the exposure options.
# ---------------------------------------------------------------------------

# The origin. No service account: nothing runs, so there is no identity for
# anything to run as. The bucket is read anonymously by the LB — see
# `site_gcs` for why that grant is the only way a backend bucket works.
napkin_site = site_gcs(
    name = "napkin_battle",
    bucket_name = BUCKET_NAME,
    location = REGION,
    project = PROJECT,
)

tf_root(
    name = "terraform",
    backend_bucket = "senku-prod-terraform-state",
    docs = [
        google_provider(project = PROJECT),
        napkin_site,
        output(
            "bucket_url",
            description = "`gs://` URL of the origin. Not how the site is served (that is the LB); exposed for `gcloud storage` inspection.",
            value = napkin_site.url,
        ),
    ],
    providers = ["@terraform_providers//:google"],
    visibility = ["//visibility:public"],
)

# The bucket's contents, which Terraform does not manage — see
# `bucket_push.bzl`. `after` is this package's own root because that root is
# what creates the bucket being written into.
bucket_push(
    name = "bucket_push",
    after = [":terraform"],
    bucket = BUCKET_NAME,
    cache_rules = ":app_layer_cache_rules",
    # The LB resolves `published_bucket()` against this node.
    visibility = ["//visibility:public"],
    webroot = ":app_layer_webroot",
)

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    visibility = ["//visibility:public"],
    deps = ["//devtools/build/tools/tf:bucket_push"],  # keep (consumed via load() in //infra/cloud/gcp/lb:defs.bzl — gazelle's bzl_library reverse-dep detection only reads BUILD files, not other .bzl, so without this the rule gets regenerated and visibility stripped)
)
