import subprocess
import unittest
from unittest.mock import patch, MagicMock

from devtools.rabbitloop.claude import fix, FixResult
from devtools.rabbitloop.github import ActionableComment

SHA_BEFORE = "aaa1111"
SHA_AFTER = "bbb2222"


def _comment(**kwargs):
    defaults = dict(
        thread_id="T_1",
        comment_body="Use a list comprehension instead of a for loop",
        file_path="src/foo.py",
        line=10,
        diff_hunk="@@ -8,3 +8,3 @@",
    )
    defaults.update(kwargs)
    return ActionableComment(**defaults)


def _patches(committed=True, pushed=True):
    """Return a list of decorators for the common mocks."""
    head_shas = [SHA_BEFORE, SHA_AFTER] if committed else [SHA_BEFORE, SHA_BEFORE]
    return [
        patch("devtools.rabbitloop.claude._is_pushed", return_value=pushed),
        patch("devtools.rabbitloop.claude._get_head_sha", side_effect=head_shas),
        patch("devtools.rabbitloop.claude.subprocess.run"),
    ]


class TestFix(unittest.TestCase):

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_completed_when_promised_committed_and_pushed(
        self, mock_run, _sha, _pushed
    ):
        mock_run.return_value = MagicMock(
            stdout="<promise>COMPLETE</promise>\n",
            returncode=0,
        )
        result = fix(_comment(), "arkeros/senku")
        self.assertTrue(result.completed)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=False)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_not_completed_when_committed_but_not_pushed(
        self, mock_run, _sha, _pushed
    ):
        mock_run.return_value = MagicMock(
            stdout="<promise>COMPLETE</promise>",
            returncode=0,
        )
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_BEFORE])
    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_not_completed_when_promised_but_no_commit(self, mock_run, _sha):
        mock_run.return_value = MagicMock(
            stdout="<promise>COMPLETE</promise>",
            returncode=0,
        )
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_not_completed_when_committed_but_no_promise(
        self, mock_run, _sha, _pushed
    ):
        mock_run.return_value = MagicMock(
            stdout="I made some changes but I'm not sure.",
            returncode=0,
        )
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_BEFORE])
    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_not_completed_when_no_promise_no_commit(self, mock_run, _sha):
        mock_run.return_value = MagicMock(
            stdout="I tried but couldn't figure it out.\n",
            returncode=0,
        )
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_dry_run_does_not_invoke_subprocess(self, mock_run):
        result = fix(_comment(), "arkeros/senku", dry_run=True)
        mock_run.assert_not_called()
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_BEFORE])
    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_handles_timeout(self, mock_run, _sha):
        mock_run.side_effect = subprocess.TimeoutExpired("claude", 300)
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_prompt_includes_file_and_comment(self, mock_run, _sha, _pushed):
        mock_run.return_value = MagicMock(
            stdout="<promise>COMPLETE</promise>",
            returncode=0,
        )
        comment = _comment(
            file_path="lib/bar.py",
            comment_body="Rename this variable",
        )
        fix(comment, "arkeros/senku")
        call_args = mock_run.call_args[0][0]
        prompt = call_args[call_args.index("-p") + 1]
        self.assertIn("lib/bar.py", prompt)
        self.assertIn("Rename this variable", prompt)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.run")
    def test_result_captures_stdout(self, mock_run, _sha, _pushed):
        mock_run.return_value = MagicMock(
            stdout="some output\n<promise>COMPLETE</promise>",
            returncode=0,
        )
        result = fix(_comment(), "arkeros/senku")
        self.assertIn("some output", result.stdout)


if __name__ == "__main__":
    unittest.main()
