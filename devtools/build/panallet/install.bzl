"""Consumer-facing setup for panallet apps.

Call `panallet_browser_modules()` once from your repo's root BUILD to
materialize the canonical npm packages a panallet app needs in browser-
ready ESM form, addressed by their npm specifier under `//:browser_modules/...`.
The naming intentionally mirrors `//:node_modules/<pkg>` and the URL shape
of esm.sh: target name == npm specifier, no escaping or transformation.

Add extra packages by calling `browser_dep` / `browser_dep_group` directly
with `name = "browser_modules/<your-pkg>"`.
"""

load("//devtools/build/js:browser_dep.bzl", "browser_dep")
load("//devtools/build/js:browser_dep_group.bzl", "browser_dep_group")

_PUBLIC = ["//visibility:public"]

def panallet_browser_modules(i18n = False, visibility = _PUBLIC):
    """Materialize the canonical browser_modules for a panallet app.

    Creates targets in the calling package using the `browser_modules/<pkg>`
    naming convention. Bare `//:node_modules/<pkg>` references inside the
    macro resolve to the caller's pnpm-lock — each repo pins its own React,
    stylex, etc. — so this is safe to call from any consumer.

    Args:
        i18n: also link `messageformat` and `@panallet/i18n-runtime` (the
            latter must already be linked into `//:node_modules/` via
            `npm_link_package` from `@senku//devtools/build/react_component/i18n_runtime:pkg`).
        visibility: visibility for the generated targets — defaults to public
            so any package in the consumer repo can reference them in
            `react_app(browser_deps = ...)`.
    """

    # React + react-dom/client + react/jsx-runtime share internals and must
    # come from one bundling pass, otherwise hooks fail with multiple-React
    # warnings. Output filenames inside the group: `react.js`,
    # `react-dom_client.js`, `react_jsx-runtime.js`.
    browser_dep_group(
        name = "browser_modules/_react",
        packages = [
            "react",
            "react-dom/client",
            "react/jsx-runtime",
        ],
        deps = [
            "//:node_modules/react",
            "//:node_modules/react-dom",
        ],
        visibility = visibility,
    )

    browser_dep(
        name = "browser_modules/react-router",
        package = "react-router",
        deps = [
            "//:node_modules/react",
            "//:node_modules/react-dom",
            "//:node_modules/react-router",
        ],
        visibility = visibility,
    )

    browser_dep(
        name = "browser_modules/cookie",
        package = "cookie",
        deps = ["//:node_modules/cookie"],
        visibility = visibility,
    )

    browser_dep(
        name = "browser_modules/set-cookie-parser",
        package = "set-cookie-parser",
        deps = ["//:node_modules/set-cookie-parser"],
        visibility = visibility,
    )

    browser_dep(
        name = "browser_modules/@stylexjs/stylex",
        package = "@stylexjs/stylex",
        deps = ["//:node_modules/@stylexjs/stylex"],
        visibility = visibility,
    )

    if i18n:
        browser_dep(
            name = "browser_modules/messageformat",
            package = "messageformat",
            deps = ["//:node_modules/messageformat"],
            visibility = visibility,
        )
        browser_dep(
            name = "browser_modules/@panallet/i18n-runtime",
            package = "@panallet/i18n-runtime",
            bundle = True,
            external = [
                "messageformat",
                "react",
                "react/jsx-runtime",
            ],
            deps = [
                "//:node_modules/@panallet/i18n-runtime",
                "//:node_modules/messageformat",
                "//:node_modules/react",
            ],
            visibility = visibility,
        )
