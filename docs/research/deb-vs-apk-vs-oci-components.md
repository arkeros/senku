# .deb vs .apk vs OCI-as-package (stagex)

## 1. What OCI subsumes that .deb / .apk leave separate

The format-level argument for OCI as a package substrate isn't aesthetic.
OCI collapses five things — that .deb and .apk each leave separate —
into one wire format and one toolchain:

1. **Identity is content-addressed.** The digest *is* the artifact.
   .deb / .apk are `name+version+arch`; verification defers to a separately
   signed *index* (apt `Release.gpg`, apk signed `APKINDEX`). In OCI,
   verification is intrinsic to the reference — there is no
   trust-on-first-use against an index.
2. **Distribution is the format's transport.** OCI registries are the
   spec. apt layers `Release` + GPG + mirror semantics on top of plain
   HTTP; apk has its own protocol. OCI is the protocol.
3. **Signing rides the same channel.** Sigstore + cosign attach
   signatures via OCI 1.1 referrers — exactly the machinery senku
   already runs at `mirror_push` (cf. `oci/distroless/README.md:5-13`).
   With .deb you sign the *index*, not the package; per-package
   `debsig-verify` is essentially abandoned.
4. **SBOM and provenance attach to the same digest.** Referrers API
   again — CycloneDX BOM + SLSA predicate hang off the component's
   digest, not stapled separately downstream. The `mirror_push` pattern
   that ties three attestations to one image generalises to "tie three
   attestations to each *component* image."
5. **No install-time scripting.** Layers are bytes-on-disk; no
   `preinst`/`postinst`/`prerm`/`postrm`, no triggers, no
   maintainer-script ordering. Composition is `COPY --from=`. Pure
   functional.

The `dpkg/status.d` synthesis at
`oci/distroless/common/package.BUILD.tmpl:36-49` exists exactly because
OCI doesn't carry a per-file package-attribution database — and that
hack is only required to feed scanners that pre-date OCI-native SBOM
consumption. Commit to "the signed CycloneDX SBOM is the scanner's
input" (which senku already publishes per
`oci/distroless/README.md:42-55`) and the hack disappears.

## 2. ...and what it costs you

**Maintainership at scale** — not format expressiveness, and not a
dependency solver. OCI carries everything name + version + route +
deps-annotation can encode, and the kinds of constraints that arise in
OCI-as-package composition (content-addressed digests, no in-place
mutation, no `Provides:` / `Conflicts:` legacy) reduce cleanly to
topological sort + an MVS-style version-conflict tie-break. The five
apt/dnf SAT triggers don't reproduce:

| apt/dnf needs SAT because... | OCI-as-package avoids it because... |
|---|---|
| Version ranges in `Depends:` (`libssl (>= 3.0, < 4.0)`) | Components are tag- or digest-pinned. No ranges, no constraint search. |
| `Provides:` virtual packages (`mail-transport-agent`) | Catalog names concrete components; choices live in `spec.yaml`. |
| `Conflicts:` mutual exclusion | No conflicts field. File-path collisions surface at `flatten`, not at constraint-solving. |
| In-place mutation (`apt-get upgrade`) | Every build is a fresh image. No "compute minimal delta from current state." |
| `Recommends:` / `Suggests:` weighted optionals | Not in the format. Optional flavors ship as separate components (`nginx-vanilla` vs `nginx-with-ldap`). |

So the solver isn't the limit — §7.3 covers it in ~80 lines of Go.
Cargo and `cmd/go` make the same bet (MVS, deterministic, no
backtracking) and live with it productively.

What OCI-as-package *does* give up at scale is the army of maintainers
who build, sign, CVE-triage, and backport. Debian has ~1 000 active
Developers + ~3 000 Maintainers covering 70 000 source packages.
stagex has ~10 people covering ~250. The ceiling is **who maintains
it**, not what the format records — and the moment a Python or Rust
workload pulls a niche FFI dep, that ceiling binds.

The elegance of OCI-as-package pays for itself **exactly where the
maintainership ceiling doesn't bind**. senku's distroless mirror
(~30 high-value components) sits well below it. A general-purpose
Linux distro is above it. Same format, opposite economics.

## 3. The framing this forces

The visible pain at `oci/distroless/**` is *not* "which file format" —
it's Debian's no-DSA-Minor backlog forcing senku to absorb ~3 VEX
statements per high-churn package per quarter (see `bash/BUILD:13-49`,
`nginx/BUILD:21-41`, `common/variables.bzl:38-54`). Recent commits
(`b5a00cd`, `1de8981`, `0b1ed4e`) are all VEX bookkeeping. The same
memory shape forbids reflexive package drops
(`feedback_cve_eliminate_vs_vex.md`).

So the format choice (§1–§2) and the fix-latency channel (this section)
converge on the same question: would moving *some* components onto an
OCI-native channel (a) recover the format-level elegance for that
component, and (b) shorten the fix-latency for the packages that drive
most of the VEX churn? Both lenses point the same direction; the
remaining question is **scope** — which packages, not whether.

## 4. Three channels, compared on what actually matters

| Axis | .deb (current) | .apk (Alpine / Wolfi) | OCI-component (stagex) |
|---|---|---|---|
| Fix latency for "no-DSA Minor" | weeks–months (sid bypasses stable backports but Debian still triages) | days–weeks (Wolfi rolls forward aggressively; Alpine main slower) | hours–days when stagex maintains it; never when they don't |
| Catalog breadth | ~70 000 src pkgs | ~5 000 (Alpine), ~1 500 (Wolfi) | ~250 (stagex), curated |
| Reproducibility | snapshot.debian.org + lockfile (verified) | Wolfi: melange + signed indexes; Alpine: signed indexes, no snapshot | full source build from minimal seed, deterministic by construction |
| SBOM identity | `pkg:deb/...&upstream=<src>` — works after the CPE-overlay fix in `sbom-cpe-emission-gap.md` | `pkg:apk/...` — grype matches on its own apk vulnerability DB; CPE story similar | `pkg:oci/<image>@<digest>` — image is the SBOM unit; stagex publishes signed CPE assertions per image |
| Trust root | Debian Security Team + ftp-master keys + snapshot mirror | Alpine sec team / Chainguard (Wolfi) | stagex maintainers (small group, multi-sig) |
| Runtime libc | glibc | musl (Alpine) or glibc (Wolfi) | glibc *or* musl, per-image choice |
| Bazel integration cost from where senku is today | zero (already there) | rewrite of matrix/lockfile/SBOM threading; keep `rules_distroless`-shape | full rewrite: drop apt machinery, compose via image refs in `oci_image(base=...)` |
| Failure mode of the channel | distro stalls a backport ("Minor issue") | upstream stalls; Wolfi single-vendor risk | stagex stalls or drops the package; no second source |
| dpkg/status.d hack (§1) | required | apk-db equivalent required | **gone** — scanners trust the image's signed SBOM |

## 5. Where each one earns or loses its keep

**.deb stays the default base.** The reproducibility story (snapshot
pinning + lockfile + signed apt index) is genuinely better than what
most projects do, and the Debian Security Tracker is the gold-standard
CVE source — grype's matcher already keys off `&upstream=<src>` (per
`sbom-cpe-emission-gap.md §2`). The catalog breadth absorbs every
transitive dep that Python / FFI / niche tools drag in without senku
having to maintain a port. The VEX tax is real but bounded;
`_cve_test_stale_*` pins it to deletions, not unbounded growth.

**.apk migration is a net sideways move.** Wolfi gives faster fix
latency, but you trade Debian's broad maintainership for Chainguard
single-vendor risk, lose the ~3× larger package universe, and rewrite
the entire lock/matrix/SBOM threading for a fix-latency win that
hybrid stagex would deliver without the rewrite. Alpine proper has the
slow-fix problem too, plus musl gotchas for any future Python/Rust
workload with C deps. Skip.

**stagex is a surgical tool, not a base swap.** The win is
concentrated: for the 2–5 packages where senku is paying real VEX tax
(today: `rust-coreutils`, `busybox`, `ncurses`-via-`libtinfo6`, and
historically `libsystemd0`-pulled-by-coreutils), a source-built signed
OCI component image removes both the fix-latency gap *and* the
dpkg/status.d scanner-compat hack for that component. For the 30+
boring packages on `:base` (base-files, netbase, tzdata, media-types,
ca-certificates, libpcre2-8-0, libstdc++6, libcom-err2, …), swapping
out the channel for the same CVE rate is pure cost.

The same logic excludes stagex as a *base*: stagex's seed-built world
is ~250 packages, and "compose by image ref" stops being free once you
need twenty of them. At that point you're rebuilding the dep solver in
Starlark — which is exactly the cost §2 said you'd be paying.

## 6. Recommendation: stay on .deb, add a stagex (or wolfi-image) overlay slot

Rank:

- **A (status quo + finish CPE overlay):** zero structural work; finish
  the fix in `sbom-cpe-emission-gap.md §5`, keep absorbing 3 VEX/quarter
  on high-churn packages. Conservative; matches
  `feedback_cve_eliminate_vs_vex.md`.
- **B (A + stagex overlay for the 2–5 worst offenders):** add a
  `distroless_matrix` knob that can resolve a layer from
  `stagex/<name>` (or equivalent `cgr.dev/chainguard/<name>`) instead
  of the Debian apt source. Targeted: applied only where the
  VEX-per-quarter pencils out. Buys real fix-latency improvement for
  the small set of packages that drive most of the current VEX churn,
  *and* recovers the OCI-native attestation chain (§1) for that
  component. **Recommended.**
- **C (full apk / Wolfi migration):** rewrite matrix.bzl, lockfile.bzl,
  SBOM threading. Single-vendor channel risk replaces multi-vendor
  channel risk. Net wash on fix latency vs B, much higher migration
  cost. Rejected.
- **D (full stagex migration):** drop apt entirely. Catalog hits a
  ceiling the moment a Python/Rust workload pulls a niche FFI dep.
  Single-vendor channel risk. High migration cost for a hard catalog
  ceiling. Rejected on the §2 argument.

## 6.5 What to migrate first

Option B's value depends entirely on which components senku puts through
the overlay. Tally of the open VEX / wontfix surface at commit
`0b1ed4e`:

| Package | Open statements | Where | Channel swap helps? |
|---|---|---|---|
| **rust-coreutils** | 3 (CVE-2026-35341 / 35352 / 35368) | `oci/distroless/bash/BUILD:13-49` (every bash image, both modes) | **Yes** — swap to `cgr.dev/chainguard/coreutils` (GNU) or `stagex/coreutils`. Original draw was no-`libsystemd0`; both alternatives preserve it. Removes 3 VEX. |
| **libc6 (glibc)** | 3 (CVE-2026-5435 / 5450 / 5928) | `oci/distroless/common/variables.bzl:38-43` (applied globally) | **Yes, but expensive** — every dynamically-linked binary in the image re-links. Deep migration. Reward is 3 CVEs + the underlying fix-latency story. |
| **busybox-static** | 1 (CVE-2026-29004) | every `*_debug` image variant via `oci/distroless/common/variables.bzl:47-54` | **Yes** — self-contained, low migration cost. Removes the VEX from every debug image at once. |
| **docker-cli** | 2 (CVE-2026-33997 / 34040) | `devtools/workstation/BUILD:24-29` | **Yes** — `cgr.dev/chainguard/docker-cli` is actively maintained; both are unfixed Highs in sid. |
| python3.13 | 1 (CVE-2026-4786) | `devtools/workstation/BUILD:21-24` (transitive via fish) | Skip — 1 CVE doesn't justify migrating python; the transitive catalog under python is huge. |
| libxml2-16 | 1 (CVE-2026-6732) | `devtools/workstation/BUILD:64-73` (transitive via bind9-dnsutils) | Skip — VEX is `vulnerable_code_not_in_execute_path` (XSD path unused); the justification is channel-invariant. |
| nginx | 1 (CVE-2013-0337) | `oci/distroless/nginx/BUILD:21-41` | Skip — VEX is about *config* (logs to `/dev/stderr`, `/dev/stdout`), not the package binary. Channel swap removes nothing. |
| linux-libc-dev | 6 (CVE-2013-7445 … CVE-2024-21803) | `devtools/workstation/BUILD:38-55` | Skip — fundamental (headers ship, kernel doesn't run); channel-invariant. |
| ncurses (libtinfo6) | 0 today (hook present at `common/debian_fixed_vex.bzl:31`) | — | Watch — historical pain point; revisit if active VEX returns. |

### Migration order, ranked by reward / effort

1. **`busybox-static`** — 1 VEX × every debug image, low migration cost.
   *Start here.* Also the easiest test of the §7.1 `oci_component` rule
   because busybox is genuinely self-contained — no transitive deps to
   wrangle, so the rule contract is exercised cleanly the first time.
2. **`docker-cli`** — 2 unfixed Highs in sid right now, single image
   (workstation), low cost. Real near-term pain relief.
3. **`rust-coreutils`** — biggest single-package VEX win (3), moderate
   cost. Worth doing after `oci_component` is proven on busybox.
4. **`glibc`** — 3 VEX *and* the elegance prize (every other C
   component's link-time dep recomposes cleanly), but high migration
   cost. Defer until either 5+ VEX accumulate on libc6, or 1–3 have
   shipped successfully and you want the deeper structural win.

Refresh this section when re-tallying: the source rows are
`grep 'vex_statement\|WONTFIX' oci/distroless/**/BUILD
devtools/workstation/BUILD oci/distroless/common/variables.bzl`
plus the empty-hook list in `oci/distroless/common/debian_fixed_vex.bzl`.

## 7. Implementation sketch (Option B)

The Bazel surface that needs to change is small because
`distroless_matrix` already takes a `layers` callback returning labels
— the layer factory in each image's `config.bzl` (e.g.
`bash/config.bzl::bash_layers`) is the only place that names the apt
repo. Three pieces:

### 7.1 `//oci:oci_component.bzl`

A new `oci_component` rule that takes a stagex (or cgr.dev) image
reference + digest, pulls the layer set via `oci_pull`, and exposes a
`filegroup` shaped like the `@<distro>//<pkg>/<arch>` targets emitted
by `rules_distroless`. Same provider contract (a tar `filegroup` + a
`package_metadata` provider with a `pkg:oci/...` purl), so the existing
`flatten` call sites work unchanged.

### 7.2 Per-image config opt-in

A package's `config.bzl` declares `LAYER_SOURCE = "deb"` (default) or
`LAYER_SOURCE = "stagex"`, and `*_layers(...)` swaps between
`@debian//<pkg>/<arch>` and `//oci/components/<pkg>:<arch>`. Migration
is one package at a time; `_cve_test_stale_vex` enforces that VEX
entries silenced by the swap get deleted in the same commit.

### 7.3 Dependency resolver — a small Go CLI

Hand-graphing works at 5 components; it stops scaling around 15. The
component you add to fix one CVE will itself depend on glibc + pcre2 +
zlib, and you don't want to discover that by running `bazel build` and
reading link errors.

A self-contained Go binary at `oci/composer/cmd/composer/`:

- **Input:** a YAML spec listing top-level wants
  (`{name: nginx, source: stagex, version: "1.27"}`).
- **Process:** DFS through the catalog, read each component's declared
  deps from image annotations (or the attached SBOM if annotations are
  absent), detect version conflicts (fail loudly — no SAT
  backtracking), topo-sort, resolve each name to a digest via
  `go-containerregistry`.
- **Output:** a `composer.lock.yaml` (digest-pinned transitive
  closure) + an emitted `oci_components.bzl` file that materialises one
  `oci_pull` + `filegroup` per resolved component.

Run as `bazel run //oci/composer:lock` — mirrors the
`bazel run @debian//:lock` pattern already in `debian.yaml:1-3`.
Algorithm and library choices are walked through in
`§Appendix A — Go CLI sketch` (in-chat / follow-up doc).

The SBOM threading needs one change: emit `pkg:oci/<name>@<digest>` as
the purl for a stagex-sourced component, instead of `pkg:deb/...`. The
`package_metadata` provider already carries the purl as an opaque
string (per `package.BUILD.tmpl:10-14`), so the change is in the
component rule's `package_metadata(purl=...)` call, not in the SBOM
generator. The CPE overlay in `sbom-cpe-emission-gap.md` keeps working:
stagex publishes the upstream-canonical CPE in their image annotations,
so we read it from the image manifest rather than computing it from a
source-package map.

## 8. What does *not* go away

1. **VEX tooling stays.** Even on stagex, you'll occasionally need a
   `vulnerable_code_not_in_execute_path` justification when grype's NVD
   match is louder than the stagex-published CPE assertion. The
   `vex.bzl` machinery is channel-agnostic and earns its keep across
   all three.
2. **Reproducibility discipline stays.** snapshot.debian.org is
   replaced by digest-pinned `oci_pull` for stagex layers; the
   requirement to pin doesn't change, only the artifact.
3. **The CPE-emission gap fix (`sbom-cpe-emission-gap.md`) stays
   load-bearing.** Most layers will remain .deb-sourced under Option
   B; the overlay still applies to them. The stagex layers bring their
   own CPEs, which simplifies the overlay table over time — not all at
   once.

## 9. Follow-up risks

1. **Channel-fragmentation taxonomy.** Two layer sources per image
   means the SBOM has heterogeneous purl schemes (`pkg:deb/...` and
   `pkg:oci/...`). Verify grype handles mixed-purl CycloneDX 1.6
   cleanly on the published image before committing. (It does, per its
   `purlEnhancers` path, but confirm against a real attestation.)
2. **stagex maintainership.** Small team. Track their funding /
   sig-key custody; the moment they stall, swap the affected
   components back to .deb. Option B keeps that escape hatch cheap by
   design.
3. **`rules_distroless` mergedusr coherence.** stagex images may not
   follow Debian UsrMerge (`feedback_rules_distroless_mergedusr.md`).
   Validate path layout per component before adoption (`/usr/bin/x` vs
   `/bin/x`), or normalise in the component rule.
4. **Catalog drift over time.** A component that's on stagex today may
   not be in a year, and vice versa. The opt-in toggle in `config.bzl`
   makes migration symmetric in both directions.
5. **Resolver scope creep.** A Go solver is a tempting place to grow
   features. Keep it constrained: topo + cycle detection + MVS
   version-conflict resolution, nothing more. If a real-world
   constraint appears to require SAT, it means someone has imported
   apt-style `Provides:` / `Conflicts:` / version-range semantics
   into a catalog entry (cf. §2 table). That's the bug — fix the
   catalog metadata, don't grow the solver.
