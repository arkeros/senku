// Trivial component used as a fixture for the cross-package tsconfig
// test. The tsconfig lives in a sibling package (sub_tsconfig/) so
// tsc's default `**/*` include from the tsconfig dir would not find
// this src — react_component must generate a per-target tsconfig with
// an explicit `files` list for the build to succeed.
export function CrossPkg() {
  return null;
}
