"""Unit tests for the AgentGuard Python SDK."""

import io
import json
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from agentguard import (
    AgentGuard,
    AgentGuardAuthenticationError,
    AgentGuardError,
    AgentGuardTimeoutError,
    AgentGuardValidationError,
)


class TestAgentGuardClient(unittest.TestCase):
    """Test suite for AgentGuard Python client."""

    def test_initialization_validation(self):
        with self.assertRaises(AgentGuardError):
            AgentGuard(base_url="", api_key="ag_live_123")

        with self.assertRaises(AgentGuardError):
            AgentGuard(base_url="http://localhost:3001", api_key="")

        guard = AgentGuard(base_url="http://localhost:3001///", api_key="ag_live_key")
        self.assertEqual(guard.base_url, "http://localhost:3001")
        self.assertEqual(guard.default_headers["X-API-Key"], "ag_live_key")
        self.assertEqual(guard.default_headers["Authorization"], "Bearer ag_live_key")

    def test_context_manager(self):
        with AgentGuard(base_url="http://localhost:3001", api_key="ag_live_key") as guard:
            self.assertEqual(guard.base_url, "http://localhost:3001")

    @patch("urllib.request.urlopen")
    def test_evaluate_allow_decision(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps({
            "status": "ALLOW",
            "decision": "ALLOW",
            "isAllowed": True,
            "reason": "Action permitted by policy",
            "violations": [],
            "requestId": "req_py_allow_123",
            "policyVersion": 1,
            "amountFormatted": "15.00",
            "currency": "USD"
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        guard = AgentGuard(base_url="http://localhost:3001", api_key="ag_live_key")
        decision = guard.evaluate(action="payment.create", amount=15.0, currency="USD")

        self.assertEqual(decision.status, "ALLOW")
        self.assertEqual(decision.decision, "ALLOW")
        self.assertTrue(decision.is_allowed)
        self.assertFalse(decision.is_held)
        self.assertFalse(decision.is_blocked)
        self.assertEqual(decision.request_id, "req_py_allow_123")
        self.assertEqual(decision.policy_version, 1)

    @patch("urllib.request.urlopen")
    def test_evaluate_hold_decision(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 202
        mock_resp.read.return_value = json.dumps({
            "status": "HOLD",
            "decision": "HOLD",
            "isAllowed": False,
            "reason": "Requires human approval",
            "violations": ["THRESHOLD_EXCEEDED"],
            "requestId": "req_py_hold_456",
            "pendingApprovalId": "appr_uuid_999"
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        guard = AgentGuard(base_url="http://localhost:3001", api_key="ag_live_key")
        decision = guard.evaluate({
            "action": "payment.create",
            "amount": 35.0
        })

        self.assertEqual(decision.status, "HOLD")
        self.assertFalse(decision.is_allowed)
        self.assertTrue(decision.is_held)
        self.assertFalse(decision.is_blocked)
        self.assertEqual(decision.pending_approval_id, "appr_uuid_999")

    @patch("urllib.request.urlopen")
    def test_evaluate_block_decision(self, mock_urlopen):
        error_body = json.dumps({
            "status": "BLOCK",
            "decision": "BLOCK",
            "isAllowed": False,
            "reason": "Spending limit exceeded",
            "violations": ["MAX_AMOUNT_EXCEEDED: $150.00 > $50.00"],
            "requestId": "req_py_block_789"
        }).encode("utf-8")

        mock_http_error = urllib.error.HTTPError(
            url="http://localhost:3001/api/v1/evaluate",
            code=403,
            msg="Forbidden",
            hdrs=None,
            fp=io.BytesIO(error_body)
        )
        mock_urlopen.side_effect = mock_http_error

        guard = AgentGuard(base_url="http://localhost:3001", api_key="ag_live_key")
        decision = guard.evaluate(action="payment.create", amount=150.0)

        self.assertEqual(decision.status, "BLOCK")
        self.assertFalse(decision.is_allowed)
        self.assertFalse(decision.is_held)
        self.assertTrue(decision.is_blocked)
        self.assertIn("MAX_AMOUNT_EXCEEDED", decision.violations[0])

    @patch("urllib.request.urlopen")
    def test_evaluate_authentication_error(self, mock_urlopen):
        error_body = json.dumps({
            "error": "AUTHENTICATION_FAILED",
            "message": "Invalid API key"
        }).encode("utf-8")

        mock_http_error = urllib.error.HTTPError(
            url="http://localhost:3001/api/v1/evaluate",
            code=401,
            msg="Unauthorized",
            hdrs=None,
            fp=io.BytesIO(error_body)
        )
        mock_urlopen.side_effect = mock_http_error

        guard = AgentGuard(base_url="http://localhost:3001", api_key="ag_live_bad_key")
        with self.assertRaises(AgentGuardAuthenticationError):
            guard.evaluate(action="payment.create")

    @patch("urllib.request.urlopen")
    def test_evaluate_timeout_error(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError("The read operation timed out")

        guard = AgentGuard(base_url="http://localhost:3001", api_key="ag_live_key", timeout=0.1)
        with self.assertRaises(AgentGuardTimeoutError):
            guard.evaluate(action="payment.create")

    @patch("urllib.request.urlopen")
    def test_evaluate_safely_fails_closed_on_network_error(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

        guard = AgentGuard(base_url="http://localhost:9999", api_key="ag_live_key")
        decision = guard.evaluate_safely(action="payment.create", amount=10.0)

        self.assertEqual(decision.status, "BLOCK")
        self.assertEqual(decision.decision, "BLOCK")
        self.assertFalse(decision.is_allowed)
        self.assertTrue(decision.is_blocked)
        self.assertIn("FAIL_CLOSED", decision.reason)

    @patch("urllib.request.urlopen")
    def test_get_approval(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps({
            "id": "appr_test_1",
            "requestId": "req_1",
            "status": "APPROVED",
            "amountFormatted": "35.00",
            "currency": "USD"
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        guard = AgentGuard(base_url="http://localhost:3001", api_key="ag_live_key")
        approval = guard.get_approval("appr_test_1")

        self.assertEqual(approval.id, "appr_test_1")
        self.assertEqual(approval.status, "APPROVED")


if __name__ == "__main__":
    unittest.main()
