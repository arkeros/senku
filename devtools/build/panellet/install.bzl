"""Consumer-facing setup for panellet apps.

Call `panellet_browser_modules()` once from your repo's root BUILD to
materialize the canonical npm packages a panellet app needs in browser-
ready ESM form, addressed by their npm specifier under `//:browser_modules/...`.
The naming intentionally mirrors `//:node_modules/<pkg>` and the URL shape
of esm.sh: target name == npm specifier, no escaping or transformation.

Add extra packages by calling `browser_dep` / `browser_dep_group` directly
with `name = "browser_modules/<your-pkg>"` (or whatever prefix you passed
as `name` to `panellet_browser_modules`).
"""

load("//devtools/build/js:browser_dep.bzl", "browser_dep")
load("//devtools/build/js:browser_dep_group.bzl", "browser_dep_group")

_PUBLIC = ["//visibility:public"]

# npm packages the canonical panellet browser_modules wrap. Verified at
# macro time against native.existing_rules() so a missing entry produces
# a clear "add X to package.json" diagnostic instead of the misleading
# "source file <X> not in this package" error aspect_rules_js emits when
# a //:node_modules/<X> alias is absent.
_BASE_REQUIRED_NPM_PACKAGES = [
    "react",
    "react-dom",
    "react-router",
    "cookie",
    "set-cookie-parser",
    "@stylexjs/stylex",
]
_I18N_REQUIRED_NPM_PACKAGES = [
    "messageformat",
]

def _check_required_packages(i18n, node_modules):
    existing = native.existing_rules()

    def _missing_from_node_modules(pkg):
        return (node_modules + "/" + pkg) not in existing

    required = list(_BASE_REQUIRED_NPM_PACKAGES)
    if i18n:
        required += _I18N_REQUIRED_NPM_PACKAGES

    missing = [p for p in required if _missing_from_node_modules(p)]
    if missing:
        fail("""

panellet_browser_modules: missing npm packages in //:{nm}/.

Add the following to your package.json and run `pnpm install`:
{pkgs}

Then make sure your root BUILD calls `npm_link_all_packages(name = "{nm}")`
*before* `panellet_browser_modules(...)`.
""".format(
            nm = node_modules,
            pkgs = "\n".join(["  - " + p for p in missing]),
        ))

    if i18n and (node_modules + "/@panellet/i18n-runtime") not in existing:
        fail("""

panellet_browser_modules(i18n = True) requires @panellet/i18n-runtime
linked into //:{nm}/. Add this to your root BUILD *before* the
panellet_browser_modules call:

    load("@aspect_rules_js//npm:defs.bzl", "npm_link_package")
    npm_link_package(
        name = "{nm}/@panellet/i18n-runtime",
        src = "@senku//devtools/build/react_component/i18n_runtime:pkg",
        visibility = ["//visibility:public"],
    )
""".format(nm = node_modules))

def panellet_browser_modules(
        name = "browser_modules",
        node_modules = "node_modules",
        i18n = False,
        visibility = _PUBLIC):
    """Materialize the canonical browser_modules for a panellet app.

    Creates targets in the calling package using the `<name>/<pkg>` naming
    convention. Bare `//:<node_modules>/<pkg>` references inside the macro
    resolve to the caller's pnpm-lock — each repo pins its own React,
    stylex, etc. — so this is safe to call from any consumer.

    Args:
        name: prefix for the generated browser_modules targets. Defaults to
            "browser_modules" (mirrors npm_link_all_packages's default
            "node_modules"). The targets land at `//<pkg>:<name>/<specifier>`,
            e.g. `//:browser_modules/react`. Override if you call
            npm_link_all_packages with a non-default `name` and want to
            keep the prefixes paired.
        node_modules: name of the `npm_link_all_packages` umbrella target
            in the calling package. Defaults to "node_modules"; matches
            `npm_link_all_packages(name = ...)`. Used both to construct
            //:<node_modules>/<pkg> deps and to existence-check them.
        i18n: also link `messageformat` and `@panellet/i18n-runtime` (the
            latter must already be linked into `//:<node_modules>/` via
            `npm_link_package` from `@senku//devtools/build/react_component/i18n_runtime:pkg`).
        visibility: visibility for the generated targets — defaults to public
            so any package in the consumer repo can reference them in
            `react_app(browser_deps = ...)`.
    """

    _check_required_packages(i18n, node_modules)

    nm = "//:" + node_modules

    # React + react-dom/client + react/jsx-runtime share internals and must
    # come from one bundling pass, otherwise hooks fail with multiple-React
    # warnings. Output filenames inside the group: `react.js`,
    # `react-dom_client.js`, `react_jsx-runtime.js`.
    browser_dep_group(
        name = name + "/_react",
        packages = [
            "react",
            "react-dom/client",
            "react/jsx-runtime",
        ],
        deps = [
            nm + "/react",
            nm + "/react-dom",
        ],
        visibility = visibility,
    )

    browser_dep(
        name = name + "/react-router",
        package = "react-router",
        deps = [
            nm + "/react",
            nm + "/react-dom",
            nm + "/react-router",
        ],
        visibility = visibility,
    )

    browser_dep(
        name = name + "/cookie",
        package = "cookie",
        deps = [nm + "/cookie"],
        visibility = visibility,
    )

    browser_dep(
        name = name + "/set-cookie-parser",
        package = "set-cookie-parser",
        deps = [nm + "/set-cookie-parser"],
        visibility = visibility,
    )

    browser_dep(
        name = name + "/@stylexjs/stylex",
        package = "@stylexjs/stylex",
        deps = [nm + "/@stylexjs/stylex"],
        visibility = visibility,
    )

    if i18n:
        browser_dep(
            name = name + "/messageformat",
            package = "messageformat",
            deps = [nm + "/messageformat"],
            visibility = visibility,
        )
        browser_dep(
            name = name + "/@panellet/i18n-runtime",
            package = "@panellet/i18n-runtime",
            bundle = True,
            external = [
                "messageformat",
                "react",
                "react/jsx-runtime",
            ],
            deps = [
                nm + "/@panellet/i18n-runtime",
                nm + "/messageformat",
                nm + "/react",
            ],
            visibility = visibility,
        )
