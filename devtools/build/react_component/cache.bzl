"""The cache policy of a react_app's webroot, and its two renderings.

A built frontend is served from two kinds of origin — an nginx container and
a GCS bucket behind Cloud CDN — and neither can read the other's
configuration. nginx decides `Cache-Control` per request from `location`
blocks; a bucket has no request-time logic at all, so the header is metadata
stamped on each object when it is written.

Declaring the policy twice is how those two drift. It is declared here once,
as an ordered list, and rendered into both: `cache_rules_nginx` for the
image's `default.conf`, `cache_rules_json` for the uploader that publishes
to the bucket (see `//devtools/build/tools/webroot`).

Order is significant and first match wins. nginx would resolve overlapping
locations by its own precedence rules — `=` beats `^~` beats regex — which
a reader has to know to predict; the uploader has no such rules to fall back
on. Stating the order here means one policy with one reading.
"""

# Content-addressed URLs: the bytes under a given name never change, so a
# revalidation round-trip can never learn anything.
IMMUTABLE = "public, max-age=31536000, immutable"

# Mutable URLs: cacheable, but check with the origin first. `no-cache` is not
# `no-store` — the browser keeps the entity and revalidates it, so an
# unchanged file still costs a 304 rather than a re-download.
REVALIDATE = "no-cache"

def webroot_cache_rules(app_name):
    """The cache policy for a react_app's webroot.

    Args:
        app_name: the `react_app`'s target name. The esbuild bundle
            directory and the unhashed entry script are both named after
            it, and those two are what the policy has to tell apart.

    Returns:
        A struct with `rules` (ordered list of `struct(match, path,
        cache_control)`) and `default` (for objects no rule matches).
        `match` is one of "exact", "prefix" or "suffix"; `path` is
        webroot-relative with no leading slash, which is the form the
        bucket's object names take.
    """
    bundle_dir = "{}_bundle/".format(app_name)
    return struct(
        default = REVALIDATE,
        rules = [
            # esbuild's entry point is the one file under the bundle
            # directory whose name carries no content hash, so its bytes
            # change under a stable URL on every deploy. It must be tested
            # before the prefix rule that would otherwise freeze it for a
            # year.
            struct(
                match = "exact",
                path = "{}{}_main.js".format(bundle_dir, app_name),
                cache_control = REVALIDATE,
            ),
            # Everything else esbuild emits here is content-addressed:
            # chunk-<hash>.js and <Route>-<hash>.js.
            struct(match = "prefix", path = bundle_dir, cache_control = IMMUTABLE),
            # asset_pipeline's output. Hashes are in the filenames, and the
            # URLs are baked into the JS that references them.
            struct(match = "prefix", path = "assets/", cache_control = IMMUTABLE),
            # The unhashed remainder: index.html, the StyleX sheet,
            # normalize.css. Small, and they are how a client discovers
            # every hashed URL above — so they revalidate.
            struct(match = "suffix", path = ".html", cache_control = REVALIDATE),
            struct(match = "suffix", path = ".css", cache_control = REVALIDATE),
            struct(match = "suffix", path = ".js", cache_control = REVALIDATE),
        ],
    )

def cache_rules_json(rules):
    """Render `rules` as the JSON `//devtools/build/tools/webroot` parses.

    Args:
        rules: a `webroot_cache_rules` struct.

    Returns:
        A JSON string. Field names match the Go struct tags; the decoder
        rejects unknown fields, so a rename on either side fails the
        publish instead of silently dropping a rule.
    """
    return json.encode({
        "default_cache_control": rules.default,
        "rules": [
            {
                "match": r.match,
                "path": r.path,
                "cache_control": r.cache_control,
            }
            for r in rules.rules
        ],
    })

# nginx location modifiers that reproduce each match kind. Suffix has no
# modifier of its own — it becomes an extension regex, built by
# `_nginx_location`.
_NGINX_MODIFIER = {
    "exact": "=",
    "prefix": "^~",
}

def _nginx_location(rule):
    if rule.match == "suffix":
        if not rule.path.startswith("."):
            fail("suffix rule %r must be a file extension starting with '.'" % rule.path)
        return "~ \\%s$" % rule.path
    modifier = _NGINX_MODIFIER.get(rule.match)
    if modifier == None:
        fail("unknown match kind %r" % rule.match)

    # Rule paths are webroot-relative because that is what a bucket object
    # is named; nginx matches request URIs, which are absolute.
    return "%s /%s" % (modifier, rule.path)

def cache_rules_nginx(rules):
    """Render `rules` as the `location` blocks of an nginx server block.

    Args:
        rules: a `webroot_cache_rules` struct.

    Returns:
        A string of `location` blocks, in rule order, for substitution into
        `default.conf.tpl`. The default is not rendered here — it belongs at
        `server` level, above these, so that a location without its own
        `add_header` inherits it.
    """
    return "\n\n".join([
        "\n".join([
            "    location %s {" % _nginx_location(r),
            '        add_header Cache-Control "%s";' % r.cache_control,
            "    }",
        ])
        for r in rules.rules
    ])
