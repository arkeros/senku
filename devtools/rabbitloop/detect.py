import subprocess


def _gh(*args: str) -> str | None:
    try:
        result = subprocess.run(
            ["gh", *args],
            capture_output=True,
            text=True,
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    out = result.stdout.strip()
    return out or None


def detect_repo() -> str | None:
    return _gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")


def detect_pr() -> int | None:
    value = _gh("pr", "view", "--json", "number", "-q", ".number")
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def detect_owner() -> str | None:
    return _gh("api", "user", "-q", ".login")
