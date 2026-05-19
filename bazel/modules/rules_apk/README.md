# rules_apk

Bazel-native APK (Alpine Package Keeper) consumption for wolfi and
alpine repositories. Companion to `@rules_rpm`; same module-extension
shape, same lockfile philosophy, format-specific differences captured
inline.

The Go binaries wrap [`chainguard.dev/apko/pkg/apk/{apk,expandapk,types}`](https://github.com/chainguard-dev/apko)
— the canonical library apko itself sits on top of — for APK file
splitting, `.PKGINFO` parsing, version comparison, and installed-db
synthesis. We add HTTP fetching, signed-APKINDEX verification (apko
doesn't expose a clean entry point), Bazel-native build actions, and
the lockfile schema.

## Usage

```starlark
apk = use_extension("@rules_apk//apk:extensions.bzl", "apk")
apk.install(
    name = "wolfi",
    repo_url = "https://packages.wolfi.dev/os",
    signing_key = "//:wolfi-signing.rsa.pub",
    architectures = ["x86_64", "aarch64"],
    packages = [
        "wolfi-baselayout",
        "ca-certificates-bundle",
        "tzdata",
        "glibc",
    ],
    lock_file = "//:wolfi.lock.json",
    distro = "wolfi",
)
use_repo(apk, "wolfi")
```

Consume per-package tars in image composition:

```starlark
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("@rules_apk//apk:defs.bzl", "apkdb_merge")

apkdb_merge(
    name = "wolfi_installed_db_amd64",
    srcs = [
        "@wolfi//tzdata/noarch",
        "@wolfi//ca-certificates-bundle/x86_64",
        "@wolfi//wolfi-baselayout/noarch",
    ],
)

flatten(
    name = "static_amd64_wolfi_layer",
    tars = [
        "@wolfi//tzdata/noarch",
        "@wolfi//ca-certificates-bundle/x86_64",
        "@wolfi//wolfi-baselayout/noarch",
        ":wolfi_installed_db_amd64",
    ],
)
```

Refresh the lockfile against the live upstream:

```bash
bazel run @wolfi//:pin
```

## Why a new module instead of bending rules_rpm

The two formats overlap in shape (closed-manifest, signed-index trust
chain, per-package extraction) but diverge in primitives. A unified
`rules_pkg` would have to switch on every primitive; clean separation
keeps each ruleset readable and lets either move independently.

| Concern | rules_rpm | rules_apk |
|---|---|---|
| Repo metadata | `repomd.xml` + per-arch `primary.xml.gz` (XML) | `APKINDEX.tar.gz` (tar with text records) |
| Repo signature | Detached `repomd.xml.asc` (OpenPGP) | RSA detached, embedded in `APKINDEX.tar.gz`'s signature segment |
| Hash family | SHA-1/SHA-256/SHA-512 inside RPM header (OpenPGP) | RSA-PKCS#1-v1.5 over SHA-1/SHA-256/SHA-512 of post-signature bytes |
| Keyring loader | OpenPGP via `ProtonMail/go-crypto` | PEM-encoded RSA pubkeys via `crypto/rsa` (`apk/tools/internal/apkkey`) |
| Installed-db | Binary sqlite at `/usr/lib/sysimage/rpm/rpmdb.sqlite` | Flat text at `/lib/apk/db/installed` |
| Merge step | `rpmdb-merge` synthesizes sqlite + secondary indexes | `apkdb-merge` sorts + concatenates text fragments |
| Per-package output | `content.tar` + `header.blob` | `content.tar` + `installed.fragment` |
| Version-constraint deps | `requires` with rpmvercmp | `D:`/`p:` with apk-version compare (simplified to string compare in MVP) |

## Trust chain

At lock time:

1. `APKINDEX.tar.gz` carries an embedded RSA signature over the
   compressed bytes of the index segment. `pin` verifies this
   signature against the consumer-supplied signing key before reading
   any package metadata.
2. The signed index names every (package, version) and the path layout
   of the per-package `.apk` files.
3. `pin` GETs each `.apk` in the dependency closure, streams it through
   SHA-256, and writes the digest into the lockfile.

At build time:

1. Bazel re-verifies each `.apk`'s SHA-256 on download.
2. `apk-extract` walks the trusted bytes and emits the content tar and
   installed-db fragment.

**Deliberate omission**: rules_apk does **not** verify per-`.apk` RSA
signatures inside the package files. The trust chain above is
equivalent in strength to rules_distroless's apt path (SHA-256 chain
anchored by a signed repo index) and matches our Debian-side posture.
rules_rpm verifies twice (repomd.xml.asc plus per-RPM GPG) because RPM
ships per-package signatures as a first-class header field; APK
ships them but their canonical use case is `apk add`'s online install,
not Bazel hermetic builds. If a future threat model raises the bar
(unsigned-snapshot consumers, supply-chain transparency requirements),
the second verification slots into `apk-extract` cleanly.

## Repository signatures are always required

Unlike rules_rpm (which has a `repomd_signature = "optional"` for
upstreams like Hummingbird that don't publish a detached signature
over the index), every APK repository in the wild ships a signed
`APKINDEX.tar.gz` — the format requires it. No opt-out.

## Consumer-side requirement

apko's auth code transitively imports `chainguard.dev/sdk`, which ships
protobuf files that reference `google/api/*` paths the dep graph doesn't
carry. gazelle generates BUILD rules for every .proto and breaks
analysis. Bazel forbids non-root modules from declaring
`gazelle_override`, so consumers must add this to their **root**
`MODULE.bazel` once:

```starlark
apk_go_deps = use_extension("@gazelle//:extensions.bzl", "go_deps")
apk_go_deps.gazelle_override(
    directives = ["gazelle:proto disable"],
    path = "chainguard.dev/sdk",
)
```

The referenced sdk code is unreachable at runtime — apko's auth.go is
the only caller, and rules_apk's binaries never invoke auth.

## Layout

```
rules_apk/
├── MODULE.bazel          module definition (apko dep wired here)
├── BUILD
├── go.mod
├── README.md             (this file)
└── apk/
    ├── BUILD
    ├── defs.bzl                 # apk_package, apkdb_merge re-exports
    ├── extensions.bzl           # `apk` module extension + `install` tag class
    ├── private/
    │   ├── install.bzl          # apk_install_repo / apk_package_repo
    │   ├── per_package.bzl      # apk_package rule (runs apk-extract)
    │   ├── apkdb_merge.bzl      # apkdb_merge rule
    │   ├── gather.bzl           # gather_apk_fragments aspect
    │   ├── pin.bzl              # apk_pin rule (`:pin` runnable)
    │   ├── pin.sh.tpl
    │   ├── providers.bzl        # ApkFragmentInfo, TransitiveApkFragmentInfo
    │   └── lockfile.bzl         # JSON schema + parser
    └── tools/
        ├── pin/                 # Go binary: APKINDEX → lockfile
        │                          (uses apk.ParsePackageIndex, apk.CompareVersions)
        ├── apk-extract/         # Go binary: .apk → (content.tar, installed.fragment)
        │                          (uses expandapk.Split, types.ParsePackageInfo,
        │                           apk.PackageToInstalled)
        ├── apkdb-merge/         # Go binary: N fragments → /lib/apk/db/installed tar
        └── internal/
            ├── apkkey/          # PEM RSA pubkey parser (apko has only digest primitives)
            └── apkformat/       # APKINDEX signature verifier (apko doesn't expose this
                                    without dragging in repository-fetching auth code);
                                    multi-gz reader and signature primitives only.
```

## See also

- `bazel/modules/rules_rpm/` — the RPM-side analog. Same module
  extension shape, same lockfile philosophy. Differences captured in
  the table above.
- `docs/adr/0007-hummingbird-rpm-base.md` — the ADR behind rules_rpm,
  including the rationale for closed-manifest semantics and the
  reproducibility requirements on the extract step. Most of that
  reasoning carries over verbatim.
