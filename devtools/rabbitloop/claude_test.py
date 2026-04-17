import io
import json
import subprocess
import unittest
from unittest.mock import patch, MagicMock

from devtools.rabbitloop.claude import fix, FixResult, _get_head_sha, _is_pushed
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
        url="https://github.com/arkeros/senku/pull/42#discussion_r1001",
    )
    defaults.update(kwargs)
    return ActionableComment(**defaults)


def _stream_json_output(result_text):
    """Build stream-json lines that claude --output-format stream-json emits."""
    lines = []
    lines.append(json.dumps({
        "type": "assistant",
        "message": {
            "content": [{"type": "text", "text": result_text}],
        },
    }))
    lines.append(json.dumps({
        "type": "result",
        "result": result_text,
    }))
    return "\n".join(lines) + "\n"


def _mock_popen(result_text, returncode=0):
    mock_proc = MagicMock()
    mock_proc.stdout = io.StringIO(_stream_json_output(result_text))
    mock_proc.returncode = returncode
    mock_proc.wait.return_value = returncode
    return mock_proc


def _events_to_stream(events):
    return "\n".join(json.dumps(e) for e in events) + "\n"


def _mock_popen_events(events, returncode=0):
    proc = MagicMock()
    proc.stdout = io.StringIO(_events_to_stream(events))
    proc.returncode = returncode
    proc.wait.return_value = returncode
    return proc


class TestFix(unittest.TestCase):

    def setUp(self):
        # Pin the per-invocation nonce so existing tests can keep asserting
        # on the literal "<promise>COMPLETE</promise>" marker.
        patcher = patch(
            "devtools.rabbitloop.claude._generate_nonce",
            return_value="COMPLETE",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_completed_when_promised_committed_and_pushed(
        self, mock_popen, _sha, _pushed
    ):
        mock_popen.return_value = _mock_popen("<promise>COMPLETE</promise>\n")
        result = fix(_comment(), "arkeros/senku")
        self.assertTrue(result.completed)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=False)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_not_completed_when_committed_but_not_pushed(
        self, mock_popen, _sha, _pushed
    ):
        mock_popen.return_value = _mock_popen("<promise>COMPLETE</promise>")
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_BEFORE])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_not_completed_when_promised_but_no_commit(self, mock_popen, _sha):
        mock_popen.return_value = _mock_popen("<promise>COMPLETE</promise>")
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_not_completed_when_committed_but_no_promise(
        self, mock_popen, _sha, _pushed
    ):
        mock_popen.return_value = _mock_popen("I made some changes but I'm not sure.")
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_BEFORE])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_not_completed_when_no_promise_no_commit(self, mock_popen, _sha):
        mock_popen.return_value = _mock_popen("I tried but couldn't figure it out.\n")
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_dry_run_does_not_invoke_subprocess(self, mock_popen):
        result = fix(_comment(), "arkeros/senku", dry_run=True)
        mock_popen.assert_not_called()
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_BEFORE])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_handles_timeout(self, mock_popen, _sha):
        mock_proc = _mock_popen("")
        # First call (with timeout=300) raises, second call (cleanup) succeeds
        mock_proc.wait.side_effect = [
            subprocess.TimeoutExpired("claude", 300),
            None,
        ]
        mock_proc.kill = MagicMock()
        mock_popen.return_value = mock_proc
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)
        mock_proc.kill.assert_called_once()

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_prompt_includes_file_and_comment(self, mock_popen, _sha, _pushed):
        mock_popen.return_value = _mock_popen("<promise>COMPLETE</promise>")
        comment = _comment(
            file_path="lib/bar.py",
            comment_body="Rename this variable",
        )
        fix(comment, "arkeros/senku")
        call_args = mock_popen.call_args[0][0]
        prompt = call_args[call_args.index("-p") + 1]
        self.assertIn("lib/bar.py", prompt)
        self.assertIn("Rename this variable", prompt)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_result_captures_stdout(self, mock_popen, _sha, _pushed):
        mock_popen.return_value = _mock_popen("some output\n<promise>COMPLETE</promise>")
        result = fix(_comment(), "arkeros/senku")
        self.assertIn("some output", result.stdout)

    @patch("devtools.rabbitloop.claude._get_head_sha", return_value=SHA_BEFORE)
    @patch("devtools.rabbitloop.claude.subprocess.Popen", side_effect=FileNotFoundError("claude"))
    def test_handles_missing_claude_binary(self, _popen, _sha):
        result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude.logging")
    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_logs_bash_command_with_tool_call(
        self, mock_popen, _sha, _pushed, mock_logging
    ):
        events = [
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Bash",
                 "input": {"command": "git push origin feat/x"}},
            ]}},
            {"type": "result", "result": "<promise>COMPLETE</promise>"},
        ]
        mock_popen.return_value = _mock_popen_events(events)
        fix(_comment(), "arkeros/senku")
        info_log = " ".join(str(c) for c in mock_logging.info.call_args_list)
        self.assertIn("Bash", info_log)
        self.assertIn("git push origin feat/x", info_log)

    @patch("devtools.rabbitloop.claude.logging")
    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_logs_read_file_path_with_tool_call(
        self, mock_popen, _sha, _pushed, mock_logging
    ):
        events = [
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Read",
                 "input": {"file_path": "lib/bar.py"}},
            ]}},
            {"type": "result", "result": "<promise>COMPLETE</promise>"},
        ]
        mock_popen.return_value = _mock_popen_events(events)
        fix(_comment(), "arkeros/senku")
        info_log = " ".join(str(c) for c in mock_logging.info.call_args_list)
        self.assertIn("lib/bar.py", info_log)

    @patch("devtools.rabbitloop.claude.logging")
    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_logs_tool_result_events(
        self, mock_popen, _sha, _pushed, mock_logging
    ):
        events = [
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Bash", "input": {"command": "echo hi"}},
            ]}},
            {"type": "user", "message": {"content": [
                {"type": "tool_result", "content": "hi", "is_error": False},
            ]}},
            {"type": "result", "result": "<promise>COMPLETE</promise>"},
        ]
        mock_popen.return_value = _mock_popen_events(events)
        fix(_comment(), "arkeros/senku")
        info_log = " ".join(str(c) for c in mock_logging.info.call_args_list)
        self.assertIn("Tool result", info_log)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_spoofed_marker_without_nonce_is_not_completed(
        self, mock_popen, _sha, _pushed
    ):
        # Simulate a reviewer quoting the literal marker in their comment
        # body; Claude parrots it back but does not know the per-invocation
        # nonce. Must not count as completion.
        with patch(
            "devtools.rabbitloop.claude._generate_nonce",
            return_value="secret-nonce-123",
        ):
            mock_popen.return_value = _mock_popen("<promise>COMPLETE</promise>")
            result = fix(_comment(), "arkeros/senku")
        self.assertFalse(result.completed)

    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_completes_when_echoing_the_nonce(
        self, mock_popen, _sha, _pushed
    ):
        with patch(
            "devtools.rabbitloop.claude._generate_nonce",
            return_value="secret-nonce-123",
        ):
            mock_popen.return_value = _mock_popen(
                "<promise>secret-nonce-123</promise>"
            )
            result = fix(_comment(), "arkeros/senku")
        self.assertTrue(result.completed)

    @patch("devtools.rabbitloop.claude._get_head_sha", return_value=SHA_BEFORE)
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_nonce_is_included_in_prompt(self, mock_popen, _sha):
        with patch(
            "devtools.rabbitloop.claude._generate_nonce",
            return_value="secret-nonce-123",
        ):
            mock_popen.return_value = _mock_popen("nope")
            fix(_comment(), "arkeros/senku")
        call_args = mock_popen.call_args[0][0]
        prompt = call_args[call_args.index("-p") + 1]
        self.assertIn("secret-nonce-123", prompt)

    @patch("devtools.rabbitloop.claude.logging")
    @patch("devtools.rabbitloop.claude._is_pushed", return_value=True)
    @patch("devtools.rabbitloop.claude._get_head_sha", side_effect=[SHA_BEFORE, SHA_AFTER])
    @patch("devtools.rabbitloop.claude.subprocess.Popen")
    def test_logs_tool_result_error_as_warning(
        self, mock_popen, _sha, _pushed, mock_logging
    ):
        events = [
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Bash", "input": {"command": "false"}},
            ]}},
            {"type": "user", "message": {"content": [
                {"type": "tool_result", "content": "oops", "is_error": True},
            ]}},
            {"type": "result", "result": "<promise>COMPLETE</promise>"},
        ]
        mock_popen.return_value = _mock_popen_events(events)
        fix(_comment(), "arkeros/senku")
        warning_log = " ".join(str(c) for c in mock_logging.warning.call_args_list)
        self.assertIn("Tool result", warning_log)
        self.assertIn("error", warning_log)


class TestGitHelpers(unittest.TestCase):

    @patch("devtools.rabbitloop.claude.subprocess.run", side_effect=FileNotFoundError("git"))
    def test_get_head_sha_returns_none_when_git_missing(self, _run):
        self.assertIsNone(_get_head_sha())

    @patch("devtools.rabbitloop.claude.subprocess.run", side_effect=FileNotFoundError("git"))
    def test_is_pushed_returns_false_when_git_missing(self, _run):
        self.assertFalse(_is_pushed())


if __name__ == "__main__":
    unittest.main()
