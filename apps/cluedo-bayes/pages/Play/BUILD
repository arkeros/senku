load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Play",
    srcs = ["Play.tsx"],
    i18n = glob(["Play.*.mf2.json"]),
    visibility = ["//apps/cluedo-bayes:__pkg__"],
    deps = [
        "//:node_modules/@panellet/i18n-runtime",
        "//apps/cluedo-bayes/game:cards",
        "//apps/cluedo-bayes/game:information",
        "//apps/cluedo-bayes/game:knowledge",
        "//apps/cluedo-bayes/game:solver",
        "//apps/cluedo-bayes/game:table",
        "//apps/cluedo-bayes/ui/components/CaseLog",
        "//apps/cluedo-bayes/ui/components/Chip",
        "//apps/cluedo-bayes/ui/components/Notepad",
        "//apps/cluedo-bayes/ui/theme:tokens",
    ],
)
