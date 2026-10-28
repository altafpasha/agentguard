"""AgentGuard Official Python Client."""

import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Union

from .exceptions import (
    AgentGuardAuthenticationError,
    AgentGuardError,
    AgentGuardForbiddenError,
    AgentGuardGatewayError,
    AgentGuardNotFoundError,
    AgentGuardRateLimitError,
    AgentGuardTimeoutError,
    AgentGuardValidationError,
)
from .models import ApprovalRecord, EvaluationResult, PromptScanResult


class AgentGuard:
    """Official Python Client for the AgentGuard AI Agent Security Gateway.

    Intercepts and authorizes agent tool calls, financial actions, and prompt inputs
    using deterministic policy enforcement and adversarial heuristic scanning.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 5.0,
        max_retries: int = 2,
        headers: Optional[Dict[str, str]] = None,
        workspace_id: Optional[str] = None,
    ):
        if not base_url or not isinstance(base_url, str):
            raise AgentGuardError("AgentGuard base_url is required and must be a non-empty string.")
        if not api_key or not isinstance(api_key, str):
            raise AgentGuardError("AgentGuard api_key is required and must be a non-empty string.")

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key.strip()
        self.timeout = float(timeout)
        self.max_retries = int(max_retries)
        self.workspace_id = workspace_id

        self.default_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "X-API-Key": self.api_key,
            "User-Agent": "agentguard-sdk-python/1.0.0",
        }
        if headers:
            self.default_headers.update(headers)
        if self.workspace_id:
            self.default_headers["X-Workspace-Id"] = self.workspace_id

    def __enter__(self) -> "AgentGuard":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def close(self) -> None:
        """Explicit resource cleanup if required."""
        pass

    def evaluate(
        self,
        action: Optional[Union[str, Dict[str, Any]]] = None,
        amount: Optional[Union[float, int, str]] = None,
        currency: str = "USD",
        recipient: Optional[Union[str, Dict[str, Any]]] = None,
        description: Optional[str] = None,
        agent_id: Optional[str] = None,
        tool: Optional[str] = None,
        operation: Optional[str] = None,
        prompt_context: Optional[str] = None,
        human_approval_token: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
        **extra_kwargs: Any,
    ) -> EvaluationResult:
        """Pre-flight policy evaluation for autonomous AI agents and backend actions.

        Supports both dictionary style (evaluate({"action": "payment.create", ...}))
        and keyword-argument style (evaluate(action="payment.create", amount=1500)).
        """
        payload: Dict[str, Any] = {}

        if isinstance(action, dict):
            payload = dict(action)
        elif isinstance(action, str):
            payload["action"] = action
            if amount is not None:
                payload["amount"] = amount
            if currency:
                payload["currency"] = currency
            if recipient is not None:
                payload["recipient"] = recipient
            if description is not None:
                payload["description"] = description
            if agent_id is not None:
                payload["agentId"] = agent_id
            if tool is not None:
                payload["tool"] = tool
            if operation is not None:
                payload["operation"] = operation
            if prompt_context is not None:
                payload["promptContext"] = prompt_context
            if human_approval_token is not None:
                payload["humanApprovalToken"] = human_approval_token
            if metadata is not None:
                payload["metadata"] = metadata
            if idempotency_key is not None:
                payload["idempotencyKey"] = idempotency_key
            if extra_kwargs:
                payload.update(extra_kwargs)
        else:
            raise AgentGuardValidationError("First argument must be either an action string or a payload dictionary.")

        if not payload.get("action"):
            raise AgentGuardValidationError("Evaluation request must specify an 'action'.")

        request_id = payload.get("idempotencyKey") or f"py_sdk_{int(time.time() * 1000)}"
        headers = {"X-Request-Id": request_id}

        status_code, body = self._request("POST", "/api/v1/evaluate", payload=payload, extra_headers=headers)

        # Policy decision returns structured evaluation even on HTTP 202 (HOLD) or 403 (BLOCK)
        if isinstance(body, dict) and body.get("status") in ("ALLOW", "HOLD", "BLOCK"):
            return EvaluationResult.from_dict(body)

        if status_code in (200, 201, 202):
            return EvaluationResult.from_dict(body)

        raise self._parse_error(status_code, body, request_id)

    def evaluate_safely(
        self,
        action: Optional[Union[str, Dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> EvaluationResult:
        """Safe evaluation wrapper with strict fail-closed guarantee.

        Never raises exceptions for network failures or gateway outages;
        strictly returns an authoritative BLOCK decision.
        """
        try:
            return self.evaluate(action, **kwargs)
        except Exception as exc:  # pylint: disable=broad-except
            reason = str(exc)
            return EvaluationResult(
                status="BLOCK",
                decision="BLOCK",
                is_allowed=False,
                is_held=False,
                is_blocked=True,
                reason=f"FAIL_CLOSED: {reason}",
                violations=[f"Gateway communication error: {reason}"],
                request_id=f"fail_closed_{int(time.time() * 1000)}",
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            )

    def get_approval(self, approval_id: str) -> ApprovalRecord:
        """Fetch human review approval record by ID."""
        if not approval_id or not isinstance(approval_id, str):
            raise AgentGuardError("approval_id is required.")

        encoded_id = urllib.parse.quote(approval_id)
        status_code, body = self._request("GET", f"/api/v1/approvals/{encoded_id}")

        if status_code == 200 and isinstance(body, dict):
            return ApprovalRecord.from_dict(body)

        raise self._parse_error(status_code, body)

    def wait_for_approval(
        self,
        approval_id: str,
        poll_interval: float = 1.0,
        timeout: float = 30.0,
    ) -> ApprovalRecord:
        """Poll a held transaction until approved, rejected, or timed out."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            record = self.get_approval(approval_id)
            if record.status != "PENDING":
                return record
            time.sleep(poll_interval)

        raise AgentGuardTimeoutError(
            f"Timed out waiting for approval on '{approval_id}' after {timeout} seconds."
        )

    def scan_prompt(self, input_text: str) -> PromptScanResult:
        """Scan prompt context for adversarial prompt injection heuristics."""
        status_code, body = self._request("POST", "/api/v1/scan", payload={"input": input_text})
        if status_code == 200 and isinstance(body, dict):
            return PromptScanResult.from_dict(body)
        raise self._parse_error(status_code, body)

    def _request(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> tuple[int, Any]:
        url = f"{self.base_url}{path}"
        headers = dict(self.default_headers)
        if extra_headers:
            headers.update(extra_headers)

        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                status_code = response.status
                response_text = response.read().decode("utf-8")
                try:
                    return status_code, json.loads(response_text)
                except Exception:
                    return status_code, {"raw": response_text}
        except urllib.error.HTTPError as exc:
            status_code = exc.code
            try:
                error_body = json.loads(exc.read().decode("utf-8"))
            except Exception:
                error_body = {"error": exc.reason}
            return status_code, error_body
        except urllib.error.URLError as exc:
            reason = str(exc.reason)
            if "timed out" in reason.lower() or isinstance(getattr(exc, "reason", None), (socket.timeout, TimeoutError)):
                raise AgentGuardTimeoutError(
                    f"AgentGuard request timed out after {self.timeout}s: {reason}"
                ) from exc
            raise AgentGuardGatewayError(
                f"Failed to connect to AgentGuard gateway at {self.base_url}: {reason}",
                status_code=503,
            ) from exc
        except (socket.timeout, TimeoutError) as exc:
            raise AgentGuardTimeoutError(
                f"AgentGuard request timed out after {self.timeout}s: {exc}"
            ) from exc
        except Exception as exc:
            raise AgentGuardGatewayError(f"Unexpected error communicating with AgentGuard: {exc}") from exc

    def _parse_error(self, status_code: int, body: Any, request_id: Optional[str] = None) -> AgentGuardError:
        message = (
            body.get("message")
            or body.get("error")
            or f"AgentGuard request failed with HTTP {status_code}"
            if isinstance(body, dict)
            else f"AgentGuard request failed with HTTP {status_code}"
        )
        details = body.get("details") if isinstance(body, dict) else None

        if status_code == 401:
            return AgentGuardAuthenticationError(message, request_id=request_id, details=details)
        if status_code == 403:
            return AgentGuardForbiddenError(message, request_id=request_id, details=details)
        if status_code == 400:
            return AgentGuardValidationError(message, request_id=request_id, details=details)
        if status_code == 404:
            return AgentGuardNotFoundError(message, request_id=request_id, details=details)
        if status_code == 429:
            return AgentGuardRateLimitError(message, request_id=request_id, details=details)
        if status_code >= 500:
            return AgentGuardGatewayError(message, status_code=status_code, request_id=request_id, details=details)

        return AgentGuardError(message, status_code=status_code, request_id=request_id, details=details)
