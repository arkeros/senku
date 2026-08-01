load("@aspect_rules_js//js:defs.bzl", "js_test")
load("//devtools/build/react_component:react_component.bzl", "react_component")

# Challenge generation, judging and the match tally. Language-neutral by
# construction: it yields numbers and enum members, never display strings, so
# the route component can translate. Randomness is injected, which is what
# makes every invariant here testable.
react_component(
    name = "rules",
    srcs = ["rules.ts"],
    _export_test = False,
    visibility = ["//apps/table-for-two:__subpackages__"],
)

js_test(
    name = "rules_test",
    data = [":rules_ts"],
    entry_point = "rules_test.mjs",
)
