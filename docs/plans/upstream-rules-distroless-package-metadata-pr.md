# Upstream rules_distroless package_metadata PR

Prompt for an agent that opens a pull request to `bazel-contrib/rules_distroless`
upstreaming the local patch at
`bazel/patches/rules_distroless_package_metadata.patch`.

## Prompt

```
Open a pull request to bazel-contrib/rules_distroless that teaches the apt
extension to emit a `package_metadata` target (PackageMetadataInfo provider
from @package_metadata) for every .deb it materializes — so SBOM tooling
that walks the build graph (e.g. supply_chain_tools' cyclonedx generator,
rules_license-aware tools, etc.) can capture base-image OS packages.

# Background

In the senku monorepo I work in, I already shipped a local fix as a
bazel `single_version_override` patch against rules_distroless 0.6.2:

  /Users/arkeros/src/github.com/arkeros/senku/bazel/patches/rules_distroless_package_metadata.patch

That patch is the implementation reference — read it first. It spans
five files and does five things:

  1. MODULE.bazel: adds `bazel_dep(name = "package_metadata", version = "0.0.10")`.

  2. apt/private/package.BUILD.tmpl: emits
       load("@package_metadata//:defs.bzl", "package_metadata")
       package(default_package_metadata = [":package_metadata"])
       package_metadata(name = "package_metadata", purl = "{purl}", ...)
     in every per-arch BUILD generated under @<aptrepo>//<pkg>/<arch>/.

  3. apt/private/deb_translate_lock.bzl: adds `_purl_encode_version()`
     (handles `+` and `:` in Debian versions) and `_deb_purl()`, threads
     a computed purl into the template.format(...) call. Adds a `distro`
     attribute to the rule and uses it.

  4. apt/extensions.bzl: adds two new `apt.install` tag-class attributes:
       - `distro` — string, default empty. Appended to each purl as
         `?distro=<value>` (e.g. "debian-13", "ubuntu-noble"). Lets
         OS-distro vulnerability scanners (grype, trivy) know which
         release advisory database to consult — without it, grype warns
         "Unable to determine the OS distribution of some packages" and
         falls back to NVD-only matching, missing the Debian Security
         Tracker.
     Threads `install.distro` into `deb_translate_lock(...)`.

  5. apt/private/lockfile.bzl: extends the lockfile schema with a
     per-package `source` field (the apt-index `Source:` value, parsed
     to drop the `(version)` suffix when present, defaulting to the
     binary name when absent — Debian's implicit-Source rule). Used in
     `_deb_purl()` to emit `&upstream=<source>` as a purl qualifier
     when source != binary name. THIS is the part that actually makes
     CVE matching work for multi-binary source packages: Debian
     advisories are indexed by *source* package (`glibc`), not binary
     (`libc6`/`libc-bin`/etc.), so grype's deb matcher needs the source
     name to bridge from the binary the SBOM lists to the advisory it
     should look up.

     For backwards compatibility, `_from_json` defaults `source` to
     `name` when an old lockfile lacks the field — so existing users
     keep working without an immediate relock. They get correct
     coverage for single-source-package debs (most of them); they need
     to re-run `bazel run @<aptrepo>//:lock` to fix multi-binary cases
     like glibc.

The package_metadata pattern mirrors gazelle's go_deps extension — each
generated repo under @gazelle++go_deps+... already declares a
`package_metadata` target with a `pkg:golang/...` purl. This makes
rules_distroless consistent with that.

Without this, build-graph SBOM generators that walk PackageMetadataInfo
see zero OS packages. With it (and a relock), I went on senku's
//oci/cmd/registry image from:
  - SBOM: 7 Go-only components → 25 components (Go + every transitive
    .deb × every platform).
  - Grype scan against the SBOM: 0 matches → 14 unique CVEs surfaced
    on libc6 alone (1 critical, 4 high, 2 medium, 7 negligible),
    correctly bridged through `upstream=glibc`.
The old "0 matches" looked like clean code but was actually a silent
hole — the SBOM didn't tell grype which advisory namespace to query.

# Things the local patch leaves on the table for upstream

My local patch hardcodes the purl namespace to `pkg:deb/debian/...`.
That's correct for Debian-derived repos but wrong for Ubuntu / other
apt families (Ubuntu purls should be `pkg:deb/ubuntu/...`).

For the upstream PR you should also:

  - Either add a separate `distro_namespace` (or `vendor`) string attribute
    defaulting to "debian", OR derive the namespace from the `distro`
    string (split on "-" — "ubuntu-noble" → "ubuntu"). The latter is
    less code but more clever-implicit. Ask the upstream maintainers
    which they'd prefer in the PR discussion if it's not obvious from
    project style.
  - Document the new `distro` attribute in the README + the apt.install
    docstring with concrete examples for Debian + Ubuntu.

# Operational

  - Working tree: clone `git@github.com:bazel-contrib/rules_distroless.git`
    fresh into a temp directory. Don't touch the senku repo for this task.
  - Check if I have a fork: `gh repo list arkeros --limit 200 | grep distroless`.
    If yes, push to `<my-fork>/<feature-branch>`. If no, ask gh to fork.
  - Branch name: `feat/apt-package-metadata` or similar.
  - Match upstream's code style — run buildifier on touched .bzl files.
  - Add unit tests under apt/tests/. Use existing resolution_test.bzl
    as a style reference. Cover at minimum:
      * package_metadata target is emitted in <pkg>/<arch>/BUILD.bazel
        with the expected purl.
      * `distro` attr surfaces in the purl as `?distro=<value>`.
      * `Source:` parsing — with version suffix `Source: glibc (2.41-12)`,
        without `(version)`, and absent (defaults to binary name).
      * `upstream=<source>` qualifier is omitted when source == binary,
        present when source != binary.
      * Lockfile schema migration: old lockfiles lacking `source` still
        load (defaulting source to name).
  - Update example lockfiles (examples/debian_snapshot/, etc.) with the
    new `source` field, OR document that consumers re-run `:lock` after
    upgrading. Don't break the e2e example by leaving stale lockfiles
    without `source` fields.
  - Run `bazel test //...` upstream and confirm green before pushing.
  - Run buildifier (or the project's `format` target if any) and commit
    any formatting changes.

# PR shape

Title (<70 chars): "feat(apt): emit package_metadata for each .deb"

Body:
  - Motivation: build-graph SBOM tooling can't see OS packages today;
    gazelle already does this for Go modules. Real-world consequence:
    silent zero-match grype scans even on debian images full of CVEs
    (because Debian advisories are keyed by source package, and the
    SBOM didn't carry source).
  - What changed:
      * package_metadata target in each generated <pkg>/<arch> BUILD.
      * New `distro` attribute on apt.install → `?distro=` purl
        qualifier (drives scanner distro detection).
      * Lockfile schema gains `source` field (parsed from apt index
        `Source:` line, default = binary name) → `&upstream=` purl
        qualifier (drives binary→source advisory bridging).
  - User-visible:
      * Default behavior unchanged for old lockfiles — backwards-compat
        path defaults source to binary name, omits `upstream=` qualifier
        when redundant.
      * To get the full benefit (correct CVE matching on multi-binary
        source packages like glibc), consumers re-run
        `bazel run @<aptrepo>//:lock` after upgrading.
      * `distro` is opt-in (default empty); without it, no `distro=`
        qualifier is emitted, matching pre-patch behavior.
  - Example: show before/after of a generated <pkg>/<arch>/BUILD.bazel
    (it now contains a package_metadata rule and a package() default)
    AND a before/after purl for libc6 (`pkg:deb/debian/libc6@...` →
    `pkg:deb/debian/libc6@...?arch=amd64&distro=debian-13&upstream=glibc`).
  - Test plan: new unit tests under apt/tests/ + `bazel test //...` clean.
  - Reference: link to package-url spec's deb-type qualifiers
    (https://github.com/package-url/purl-spec/blob/master/PURL-TYPES.rst#deb)
    and gazelle's go_deps package_metadata emission as precedent.
  - Numbers (don't link to the senku repo — it's private): equivalent
    local patch took a multi-platform OCI image's CycloneDX SBOM from
    7 to 25 components and a grype scan against that SBOM from 0
    matches to 14 unique CVEs surfaced (1 critical, 4 high). The
    upstream= qualifier was the part that flipped grype's deb matcher
    from blind to working.

# What NOT to do

  - Don't modify the senku repo or the existing local patch. The
    hardcoded "debian" namespace there is fine for now (senku's apt
    repos are all Debian-derived).
  - Don't merge or self-approve the PR — just open it and report the URL.
  - If upstream rules_distroless has refactored these files since
    0.6.2 (different template name, different codegen call shape),
    adapt to the new shape rather than forcing the old structure.
    The intent is what matters.
  - Don't add an automatic `distro` autodetect from the apt source URL —
    explicit attribute is simpler and less brittle.
  - Don't bump the lockfile schema version. The `source` field is added
    *additively* to v1 — old lockfiles still parse via the
    backwards-compat default in `_from_json`. Bumping to v2 would force
    every consumer to relock at upgrade time, which is hostile.

Report back: PR URL, the diff size, and anything notable that diverged
from this prompt (e.g. upstream had already started on this, naming
conflicts, CI failures you fixed).
```
