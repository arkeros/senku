"""Run each declared log-match alert filter against live logs and print
match counts. Used as a pre-merge / pre-apply check on alert filter changes.

Why this exists: a log-match alert is a string filter that's only evaluated
server-side at fire time. There's no compile-time check that the filter
matches what the author intended — `NOT field:"x"` matches absent fields,
`OR` precedence is easy to get wrong, and a typo in a key silently widens
the filter. The first feedback signal otherwise is a 3am page (or worse,
silence). This script closes that gap: it runs each filter against the
last N days of real logs and reports how many entries would have fired,
so a human reviewer can spot a false-positive flood (or unexpected zero
match-rate) before merging.

Source-of-truth: the rendered Terraform JSON (`main.tf.json`) emitted by
//infra/cloud/gcp/audit:terraform. Reading the rendered output rather
than re-parsing defs.bzl means the validator sees exactly what would be
applied to GCP — no drift between the script's idea of the filter and
the deployed filter.
"""

import argparse
import json
import os
import subprocess
import sys


def _resolve_tf_json() -> str:
    """Find main.tf.json via runfiles (under `bazel run`) or workspace path.

    Under `bazel run`, the file is in the runfiles tree thanks to the
    BUILD `data = [":terraform"]` dep. Outside Bazel (rare — direct
    invocation for debugging), fall back to bazel-bin in the workspace.
    """
    rel = "_main/infra/cloud/gcp/audit/terraform/main.tf.json"
    runfiles = os.environ.get("RUNFILES_DIR")
    if runfiles:
        candidate = os.path.join(runfiles, rel)
        if os.path.exists(candidate):
            return candidate
    workspace = os.environ.get("BUILD_WORKSPACE_DIRECTORY", os.getcwd())
    fallback = os.path.join(
        workspace, "bazel-bin/infra/cloud/gcp/audit/terraform/main.tf.json"
    )
    if not os.path.exists(fallback):
        sys.exit(
            f"main.tf.json not found at {fallback}; "
            "run `bazel build //infra/cloud/gcp/audit:terraform` first"
        )
    return fallback


def extract_log_match_alerts(tf_json: dict) -> list[tuple[str, str, str]]:
    """Return [(name, severity, filter)] for every log-match alert policy."""
    out = []
    policies = tf_json.get("resource", {}).get("google_monitoring_alert_policy", {})
    for name, body in policies.items():
        conditions = body.get("conditions") or []
        if not conditions:
            continue
        match = conditions[0].get("condition_matched_log") or []
        if not match:
            continue
        out.append((name, body.get("severity", ""), match[0]["filter"]))
    return sorted(out)


def count_matches(project: str, filter_str: str, days: int, sample_limit: int) -> tuple[int, list[str]]:
    """Run gcloud logging read for `filter_str` and return (count, sample_timestamps).

    Limits to `sample_limit + 1` to detect overflow (count is reported as
    `>= sample_limit + 1` in that case). Operators don't need exact
    counts — they need to spot the difference between 0, a handful, and
    a flood.
    """
    cap = sample_limit + 1
    cmd = [
        "gcloud", "logging", "read", filter_str,
        f"--project={project}",
        f"--freshness={days}d",
        f"--limit={cap}",
        "--format=value(timestamp)",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    timestamps = [t for t in result.stdout.strip().splitlines() if t]
    return len(timestamps), timestamps[:sample_limit]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--project", default="senku-prod")
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--sample-limit", type=int, default=3)
    p.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero if any alert has matches in the window. "
        "Useful as a CI gate or pre-apply guard.",
    )
    args = p.parse_args()

    with open(_resolve_tf_json()) as f:
        tf_json = json.load(f)

    alerts = extract_log_match_alerts(tf_json)
    if not alerts:
        sys.exit("no log-match alerts found in main.tf.json")

    print(f"Validating {len(alerts)} log-match alert(s) over last {args.days}d in {args.project}\n")
    total = 0
    for name, severity, filter_str in alerts:
        count, samples = count_matches(args.project, filter_str, args.days, args.sample_limit)
        total += count
        marker = ">=" if count > args.sample_limit else "  "
        print(f"  {name:30s} severity={severity:8s} matches {marker}{count}")
        for ts in samples:
            print(f"      sample: {ts}")
        print()

    if args.strict and total > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
