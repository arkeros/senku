load("@aspect_rules_ts//ts:defs.bzl", "ts_config")

# Sibling-package tsconfig used by the cross-package fixture in
# //devtools/build/react_component/testdata:CrossPkg. Reproduces the
# scenario where the tsconfig and the srcs live in different packages
# (e.g. an external repo consuming senku's `//:tsconfig`).
ts_config(
    name = "tsconfig",
    testonly = True,
    src = "tsconfig.json",
    visibility = ["//devtools/build/react_component/testdata:__pkg__"],
)
