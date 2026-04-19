"""Build a tar layer from a react_app's outputs, ready for nginx at /var/www/html."""

load("@bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory")
load("@tar.bzl", "mutate", "tar")
load("//oci:frontend_image.bzl", "NGINX_UID", "NGINX_USERNAME", "NGINX_WEB_ROOT")

def react_static_layer(
        name,
        app,
        **kwargs):
    """Build a tar layer from a react_app's outputs, laid out for nginx.

    react_app's HTML references `/{app}_bundle.js`, `/{app}_styles.css`, and
    hashed assets under `/assets/`. Nginx serves `/var/www/html` with
    `try_files $uri $uri/ /index.html`, so the tar entries must sit at
    those exact absolute paths.

    Produces:
      :{name}       — tar layer suitable as `statics_layer` for
                      @senku//oci:frontend_image.bzl. Entries:
                        /var/www/html/index.html       (renamed from {app}_index.html)
                        /var/www/html/{app}_bundle.js
                        /var/www/html/{app}_styles.css
                        /var/www/html/assets/*         (renamed from {app}_assets_flat/)
      :{name}_tree  — underlying TreeArtifact (useful for local inspection).

    Args:
        name: target name.
        app: label of a react_app in the same package (e.g. `":app"`).
            react_app emits a filegroup at `:{app_name}` aggregating the
            deployable outputs; this macro consumes that filegroup and
            derives rename rules from the app's name.
        **kwargs: forwarded to the layer tar (visibility, tags, testonly).
    """
    app_label = native.package_relative_label(app)
    if app_label.package != native.package_name():
        fail(
            ("react_static_layer: app %r must be in the same package as " +
             "this target (got package %r, expected %r). The rename rules " +
             "derived from the app's name only make sense within one package.") %
            (app, app_label.package, native.package_name()),
        )
    app_name = app_label.name

    existing = native.existing_rules()
    if app_name not in existing:
        fail(
            ("react_static_layer: no react_app named %r in //%s. " +
             "Declare `react_app(name = %r, ...)` above this call.") %
            (app_name, native.package_name(), app_name),
        )

    # runtime_config ships a `/env.js` bootstrap that must be populated at
    # container-start via envsubst on env.js.tpl. The current nginx base
    # has no such startup hook, so shipping the image as-is would 404 on
    # /env.js and crash before first render — fail explicitly until
    # react_static_layer learns to stage env.js.
    if (app_name + "_env_tpl") in existing:
        fail(
            ("react_static_layer: react_app %r uses runtime_config, which " +
             "requires staging env.js.tpl + envsubst-at-container-start. " +
             "That wiring is not implemented yet — drop runtime_config " +
             "for now, or extend react_static_layer to cover it.") % app_name,
        )

    tree = name + "_tree"
    copy_to_directory(
        name = tree,
        srcs = [app],
        root_paths = ["."],
        # Sourcemaps stay as build artifacts (useful for error reporting
        # pipelines that ingest them out-of-band), but never land in the
        # image. Shipping .map in prod leaks unminified source and bloats
        # the layer for no end-user benefit.
        exclude_srcs_patterns = ["**/*.map"],
        replace_prefixes = {
            app_name + "_index.html": "index.html",
            app_name + "_assets_flat": "assets",
        },
    )

    # Strip both the package path and the TreeArtifact's wrapper directory
    # so each file sits directly under NGINX_WEB_ROOT.
    tar(
        name = name,
        srcs = [":" + tree],
        mutate = mutate(
            owner = str(NGINX_UID),
            ownername = NGINX_USERNAME,
            package_dir = NGINX_WEB_ROOT,
            strip_prefix = native.package_name() + "/" + tree,
        ),
        **kwargs
    )
