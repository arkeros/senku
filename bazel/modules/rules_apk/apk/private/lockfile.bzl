"""JSON lockfile schema + parsing helpers.

Schema (`<name>.lock.json`):

    {
      "schema_version": 1,
      "repo": {
        "url": "https://packages.wolfi.dev/os",
        "revision": "<first 16 hex chars of apkindex_sha256>",
        "apkindex_sha256": "<sha256 of APKINDEX.tar.gz>"
      },
      "packages": {
        "<name>": {
          "<arch>": {                       # "noarch" | "x86_64" | "aarch64"
            "version": "2026a-r0",
            "sha256": "...",                # sha256 of the .apk bytes
            "path": "noarch/tzdata-2026a-r0.apk",
            "size": 1234567,
            "checksum": "Q1...=",           # APKINDEX C: value (sha1 of control)
            "origin": "tzdata"              # purl provenance
          }
        }
      }
    }

`packages[name][arch]` is the cross-product surface; `noarch` packages
have exactly one nested key, arch-specific packages have one per
declared architecture. The pin tool errors if the cross-product is
incomplete.
"""

def parse_lockfile(mctx, label):
    """Reads `label` as JSON and returns the decoded dict."""
    content = mctx.read(label)
    parsed = json.decode(content)
    if parsed.get("schema_version") != 1:
        fail("rules_apk: unsupported lockfile schema_version: %s" % parsed.get("schema_version"))
    return parsed
