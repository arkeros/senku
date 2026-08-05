"""Unit tests for the webroot cache policy and its two renderings."""

load("@bazel_skylib//lib:unittest.bzl", "asserts", "unittest")
load(":cache.bzl", "IMMUTABLE", "REVALIDATE", "cache_rules_json", "cache_rules_nginx", "webroot_cache_rules")

def _rule_order_impl(ctx):
    env = unittest.begin(ctx)

    got = [(r.match, r.path, r.cache_control) for r in webroot_cache_rules("dino").rules]

    # Order is the policy. The unhashed entry has to be tested before the
    # bundle prefix that contains it, or the entry never revalidates and a
    # deploy is invisible to every browser that already loaded the app.
    asserts.equals(env, [
        ("exact", "dino_bundle/dino_main.js", REVALIDATE),
        ("prefix", "dino_bundle/", IMMUTABLE),
        ("prefix", "assets/", IMMUTABLE),
        ("suffix", ".html", REVALIDATE),
        ("suffix", ".css", REVALIDATE),
        ("suffix", ".js", REVALIDATE),
    ], got)

    return unittest.end(env)

rule_order_test = unittest.make(_rule_order_impl)

def _json_shape_impl(ctx):
    env = unittest.begin(ctx)

    got = json.decode(cache_rules_json(webroot_cache_rules("dino")))

    asserts.equals(env, REVALIDATE, got["default_cache_control"])
    asserts.equals(env, {
        "match": "exact",
        "path": "dino_bundle/dino_main.js",
        "cache_control": REVALIDATE,
    }, got["rules"][0])

    # `ParseRules` decodes with DisallowUnknownFields, so an extra key here
    # fails the publish rather than being ignored.
    asserts.equals(env, ["default_cache_control", "rules"], sorted(got.keys()))

    return unittest.end(env)

json_shape_test = unittest.make(_json_shape_impl)

def _nginx_rendering_impl(ctx):
    env = unittest.begin(ctx)

    got = cache_rules_nginx(webroot_cache_rules("dino"))

    # `=` for exact and `^~` for prefix are what give nginx the same
    # first-match-wins order the rule list states. Without `^~`, the `.js`
    # regex below wins over the bundle prefix — regex beats an unmodified
    # prefix — and every chunk request lands on no-cache.
    asserts.true(
        env,
        "location = /dino_bundle/dino_main.js {" in got,
        "exact rule should render as an `=` location, got:\n" + got,
    )
    asserts.true(
        env,
        "location ^~ /dino_bundle/ {" in got,
        "prefix rule should render as a `^~` location, got:\n" + got,
    )
    asserts.true(
        env,
        "location ~ \\.html$ {" in got,
        "suffix rule should render as an extension regex, got:\n" + got,
    )
    asserts.true(
        env,
        'add_header Cache-Control "%s";' % IMMUTABLE in got,
        "immutable rules should emit their Cache-Control verbatim, got:\n" + got,
    )

    return unittest.end(env)

nginx_rendering_test = unittest.make(_nginx_rendering_impl)

def _nginx_order_matches_rules_impl(ctx):
    env = unittest.begin(ctx)

    got = cache_rules_nginx(webroot_cache_rules("dino"))

    exact = got.find("location = /dino_bundle/dino_main.js")
    prefix = got.find("location ^~ /dino_bundle/")
    asserts.true(env, exact != -1 and prefix != -1, "both locations should render")

    # nginx resolves `=` before any prefix regardless of declaration order,
    # so this ordering is not what makes the config correct — it is what
    # makes the config *readable as* the rule list it came from. A reader
    # comparing the two should not have to reorder one in their head.
    asserts.true(
        env,
        exact < prefix,
        "rendered locations should follow rule order, got:\n" + got,
    )

    return unittest.end(env)

nginx_order_matches_rules_test = unittest.make(_nginx_order_matches_rules_impl)

def cache_test_suite(name):
    """Wire the cache policy tests under one suite target."""
    unittest.suite(
        name,
        rule_order_test,
        json_shape_test,
        nginx_rendering_test,
        nginx_order_matches_rules_test,
    )
