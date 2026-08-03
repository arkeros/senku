load("//devtools/build/react_component:react_component.bzl", "react_component")

# The only stateful component: owns the canvas, the requestAnimationFrame
# loop, and the fingers. Deliberately holds its world in a closure rather
# than React state — a 60fps re-render would be absurd — so the effect mounts
# once and reads changing props through a ref.
#
# The loop's one real job is turning frames into moves: the rules advance a
# whole cell at a time, and everything between two of those is interpolation.
react_component(
    name = "Plate",
    srcs = ["Plate.tsx"],
    visibility = ["//apps/spaghetti-duel:__subpackages__"],
    deps = [
        "//apps/spaghetti-duel/game:rules",
        "//apps/spaghetti-duel/game:swipe",
        "//apps/spaghetti-duel/render:scene",
    ],
)
