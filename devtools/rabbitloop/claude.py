import dataclasses
import subprocess

from absl import logging

from devtools.rabbitloop.github import ActionableComment

PROMPT_TEMPLATE = """\
You are fixing a code review comment on a pull request for {repo}.

File: {file_path}
Line: {line}

Diff context:
{diff_hunk}

Review comment:
{comment_body}

Instructions:
1. Read the file and understand the review comment.
2. Implement the requested fix.
3. Commit and push your changes.
4. If and only if you successfully committed and pushed the fix, output the exact string <promise>COMPLETE</promise>.
"""


@dataclasses.dataclass
class FixResult:
    completed: bool
    stdout: str = ""
    returncode: int = 0


def _get_head_sha() -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def _is_pushed() -> bool:
    """Check that local HEAD has been pushed to the remote tracking branch."""
    result = subprocess.run(
        ["git", "rev-list", "@{u}..HEAD", "--count"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False
    return result.stdout.strip() == "0"


def fix(
    comment: ActionableComment,
    repo: str,
    dry_run: bool = False,
) -> FixResult:
    prompt = PROMPT_TEMPLATE.format(
        repo=repo,
        file_path=comment.file_path,
        line=comment.line,
        diff_hunk=comment.diff_hunk,
        comment_body=comment.comment_body,
    )

    if dry_run:
        logging.info(
            "DRY RUN: would invoke claude for %s:%s",
            comment.file_path,
            comment.line,
        )
        logging.debug("Prompt:\n%s", prompt)
        return FixResult(completed=False)

    logging.info("Invoking claude for %s:%s", comment.file_path, comment.line)

    head_before = _get_head_sha()

    try:
        result = subprocess.run(
            ["claude", "--dangerously-skip-permissions", "-p", prompt],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        logging.warning(
            "Claude timed out fixing %s:%s", comment.file_path, comment.line
        )
        return FixResult(completed=False)

    promised = "<promise>COMPLETE</promise>" in result.stdout
    head_after = _get_head_sha()
    committed = head_before is not None and head_after != head_before
    pushed = _is_pushed() if committed else False

    if promised and committed and pushed:
        logging.info("Claude fixed %s:%s", comment.file_path, comment.line)
    elif promised and committed and not pushed:
        logging.warning(
            "Claude committed but did not push for %s:%s",
            comment.file_path,
            comment.line,
        )
    elif promised and not committed:
        logging.warning(
            "Claude claimed complete but no new commit for %s:%s",
            comment.file_path,
            comment.line,
        )
    elif not promised and committed:
        logging.warning(
            "New commit found but Claude did not signal completion for %s:%s",
            comment.file_path,
            comment.line,
        )
    else:
        logging.warning(
            "Claude did not complete fix for %s:%s",
            comment.file_path,
            comment.line,
        )
        logging.debug("Claude stdout:\n%s", result.stdout)

    completed = promised and committed and pushed
    return FixResult(
        completed=completed,
        stdout=result.stdout,
        returncode=result.returncode,
    )
