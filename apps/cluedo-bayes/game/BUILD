load("@aspect_rules_js//js:defs.bzl", "js_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

# The deck, the deal, and the deduction bookkeeping. Card identities are opaque
# ids, never display text — the MF2 catalogs own the names, which is what lets
# the same logic serve three locales.
react_component(
    name = "cards",
    srcs = ["cards.ts"],
    _export_test = False,
    visibility = ["//apps/cluedo-bayes:__subpackages__"],
)

react_component(
    name = "knowledge",
    srcs = ["knowledge.ts"],
    _export_test = False,
    visibility = ["//apps/cluedo-bayes:__subpackages__"],
    deps = [":cards"],
)

react_component(
    name = "solver",
    srcs = ["solver.ts"],
    _export_test = False,
    visibility = ["//apps/cluedo-bayes:__subpackages__"],
    deps = [
        ":cards",
        ":knowledge",
    ],
)

react_component(
    name = "information",
    srcs = ["information.ts"],
    _export_test = False,
    visibility = ["//apps/cluedo-bayes:__subpackages__"],
    deps = [
        ":cards",
        ":solver",
    ],
)

react_component(
    name = "table",
    srcs = ["table.ts"],
    _export_test = False,
    visibility = ["//apps/cluedo-bayes:__subpackages__"],
    deps = [
        ":cards",
        ":knowledge",
    ],
)

js_test(
    name = "table_test",
    data = [
        ":cards_ts",
        ":knowledge_ts",
        ":table_ts",
    ],
    entry_point = "table_test.mjs",
)

js_test(
    name = "information_test",
    data = [
        ":cards_ts",
        ":information_ts",
        ":knowledge_ts",
        ":solver_ts",
    ],
    entry_point = "information_test.mjs",
)

js_test(
    name = "solver_test",
    data = [
        ":cards_ts",
        ":knowledge_ts",
        ":solver_ts",
    ],
    entry_point = "solver_test.mjs",
)

js_test(
    name = "cards_test",
    data = [":cards_ts"],
    entry_point = "cards_test.mjs",
)

js_test(
    name = "knowledge_test",
    data = [
        ":cards_ts",
        ":knowledge_ts",
    ],
    entry_point = "knowledge_test.mjs",
)
