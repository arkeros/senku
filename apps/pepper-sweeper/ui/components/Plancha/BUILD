load("//devtools/build/react_component:react_component.bzl", "react_component")

# The only stateful component: owns the canvas, the requestAnimationFrame
# loop, and the fingers. Deliberately holds its world in a closure rather
# than React state — a re-render per frame would be absurd — so the effect
# mounts once and reads changing props through a ref.
#
# The loop's one real job is the long press. Every other input is an event;
# "a finger has now been still for long enough" is not, so it is judged on the
# frame, which is also what feeds the progress ring drawn under the finger.
react_component(
    name = "Plancha",
    srcs = ["Plancha.tsx"],
    visibility = ["//apps/pepper-sweeper:__subpackages__"],
    deps = [
        "//apps/pepper-sweeper/game:board",
        "//apps/pepper-sweeper/game:field",
        "//apps/pepper-sweeper/game:input",
        "//apps/pepper-sweeper/game:match",
        "//apps/pepper-sweeper/render:scene",
    ],
)
