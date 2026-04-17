import dataclasses
import json
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
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        logging.error("`git` not found on PATH")
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def _is_pushed() -> bool:
    """Check that local HEAD has been pushed to the remote tracking branch."""
    try:
        result = subprocess.run(
            ["git", "rev-list", "@{u}..HEAD", "--count"],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        logging.error("`git` not found on PATH")
        return False
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
            "DRY RUN: would invoke claude for %s:%s\n  %s",
            comment.file_path,
            comment.line,
            comment.url,
        )
        logging.debug("Prompt:\n%s", prompt)
        return FixResult(completed=False)

    logging.info(
        "Invoking claude for %s:%s\n  %s",
        comment.file_path,
        comment.line,
        comment.url,
    )

    head_before = _get_head_sha()

    try:
        proc = subprocess.Popen(
            [
                "claude", "--dangerously-skip-permissions",
                "--verbose",
                "--output-format", "stream-json",
                "-p", prompt,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except FileNotFoundError:
        logging.error("`claude` CLI not found on PATH")
        return FixResult(completed=False)

    try:
        text_parts = []
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                print(line, flush=True)
                continue
            event_type = event.get("type")
            if event_type == "assistant":
                message = event.get("message", {})
                for block in message.get("content", []):
                    if block.get("type") == "text":
                        print(block["text"], end="", flush=True)
                        text_parts.append(block["text"])
                    elif block.get("type") == "tool_use":
                        logging.info("Tool call: %s", block.get("name", ""))
            elif event_type == "result":
                if "result" in event:
                    text_parts.append(event["result"])
        print()
        proc.wait(timeout=300)
        stdout = "".join(text_parts)
        returncode = proc.returncode
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        logging.warning(
            "Claude timed out fixing %s:%s", comment.file_path, comment.line
        )
        return FixResult(completed=False)

    promised = "<promise>COMPLETE</promise>" in stdout
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
        logging.debug("Claude stdout:\n%s", stdout)

    completed = promised and committed and pushed
    return FixResult(
        completed=completed,
        stdout=stdout,
        returncode=returncode,
    )
