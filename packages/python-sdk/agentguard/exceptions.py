"""AgentGuard Python SDK Exception Hierarchy."""

from typing import Any, Optional


class AgentGuardError(Exception):
    """Base exception for all AgentGuard errors."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        error_code: Optional[str] = None,
        request_id: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.request_id = request_id
        self.details = details

    @property
    def status(self) -> Optional[int]:
        """HTTP status code alias."""
        return self.status_code

    @property
    def code(self) -> Optional[str]:
        """Error code alias."""
        return self.error_code

    def __str__(self) -> str:
        req_suffix = f" [Request ID: {self.request_id}]" if self.request_id else ""
        return f"{self.message}{req_suffix}"


class AgentGuardAuthenticationError(AgentGuardError):
    """Raised when authentication fails (HTTP 401: missing, expired, or revoked API key)."""

    def __init__(
        self,
        message: str = "Authentication failed. Please verify your AgentGuard API key.",
        request_id: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message, status_code=401, error_code="AUTHENTICATION_FAILED", request_id=request_id, details=details)


class AgentGuardForbiddenError(AgentGuardError):
    """Raised when permissions are insufficient (HTTP 403: API key lacks required scope)."""

    def __init__(
        self,
        message: str = "Permission denied. The API key lacks the necessary permissions.",
        request_id: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message, status_code=403, error_code="FORBIDDEN", request_id=request_id, details=details)


class AgentGuardValidationError(AgentGuardError):
    """Raised when request parameters fail schema validation (HTTP 400)."""

    def __init__(
        self,
        message: str = "Invalid request parameters.",
        request_id: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message, status_code=400, error_code="VALIDATION_ERROR", request_id=request_id, details=details)


class AgentGuardNotFoundError(AgentGuardError):
    """Raised when a requested resource (e.g., approval ID) is not found (HTTP 404)."""

    def __init__(
        self,
        message: str = "Requested resource not found.",
        request_id: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message, status_code=404, error_code="NOT_FOUND", request_id=request_id, details=details)


class AgentGuardRateLimitError(AgentGuardError):
    """Raised when the gateway rate limit is exceeded (HTTP 429)."""

    def __init__(
        self,
        message: str = "Rate limit exceeded. Please back off before retrying.",
        request_id: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message, status_code=429, error_code="RATE_LIMIT_EXCEEDED", request_id=request_id, details=details)


class AgentGuardTimeoutError(AgentGuardError):
    """Raised when an HTTP request or approval wait times out."""

    def __init__(
        self,
        message: str = "AgentGuard evaluation request timed out.",
        request_id: Optional[str] = None,
    ):
        super().__init__(message, status_code=408, error_code="TIMEOUT", request_id=request_id)


class AgentGuardGatewayError(AgentGuardError):
    """Raised when the AgentGuard gateway is unreachable or returns HTTP 5xx."""

    def __init__(
        self,
        message: str = "AgentGuard gateway error or service unavailable.",
        status_code: int = 500,
        request_id: Optional[str] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message, status_code=status_code, error_code="GATEWAY_ERROR", request_id=request_id, details=details)
