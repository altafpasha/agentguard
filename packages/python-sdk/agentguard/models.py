"""AgentGuard Python SDK Data Models."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class EvaluationResult:
    """Authoritative decision returned by the AgentGuard security gateway."""

    status: str
    decision: str
    is_allowed: bool
    is_held: bool
    is_blocked: bool
    reason: str
    violations: List[str] = field(default_factory=list)
    request_id: str = ""
    policy_id: Optional[str] = None
    policy_version: Optional[int] = None
    pending_approval_id: Optional[str] = None
    authorization_token: Optional[str] = None
    amount_formatted: Optional[str] = None
    amount_cents: Optional[str] = None
    currency: Optional[str] = None
    timestamp: str = ""
    metadata: Optional[Dict[str, Any]] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EvaluationResult":
        status = data.get("status") or data.get("decision", "BLOCK")
        return cls(
            status=status,
            decision=status,
            is_allowed=(status == "ALLOW"),
            is_held=(status == "HOLD"),
            is_blocked=(status == "BLOCK"),
            reason=data.get("reason", "No reason provided by gateway"),
            violations=data.get("violations", []),
            request_id=data.get("requestId", ""),
            policy_id=data.get("policyId"),
            policy_version=data.get("policyVersion"),
            pending_approval_id=data.get("pendingApprovalId"),
            authorization_token=data.get("authorizationToken"),
            amount_formatted=data.get("amountFormatted"),
            amount_cents=data.get("amountCents"),
            currency=data.get("currency"),
            timestamp=data.get("timestamp", ""),
            metadata=data.get("metadata"),
        )


@dataclass
class ApprovalRecord:
    """Human-in-the-Loop approval record for held transactions."""

    id: str
    request_id: str
    agent_id: str
    policy_id: str
    policy_version: int
    tool: str
    operation: str
    amount_formatted: str
    amount_cents: str
    currency: str
    merchant: str
    description: str
    status: str
    risk_reasons: List[str] = field(default_factory=list)
    server_authorization_token: Optional[str] = None
    token_expires_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ApprovalRecord":
        return cls(
            id=data.get("id", ""),
            request_id=data.get("requestId", ""),
            agent_id=data.get("agentId", ""),
            policy_id=data.get("policyId", ""),
            policy_version=data.get("policyVersion", 1),
            tool=data.get("tool", ""),
            operation=data.get("operation", ""),
            amount_formatted=data.get("amountFormatted", ""),
            amount_cents=data.get("amountCents", "0"),
            currency=data.get("currency", "USD"),
            merchant=str(data.get("merchant", "")),
            description=data.get("description", ""),
            status=data.get("status", "PENDING"),
            risk_reasons=data.get("riskReasons", []),
            server_authorization_token=data.get("serverAuthorizationToken"),
            token_expires_at=data.get("tokenExpiresAt"),
            reviewed_by=data.get("reviewedBy"),
            reviewed_at=data.get("reviewedAt"),
            rejection_reason=data.get("rejectionReason"),
            created_at=data.get("createdAt", ""),
        )


@dataclass
class PromptScanResult:
    """Result of prompt injection heuristic scanning."""

    is_threat_detected: bool
    risk_score: float
    threat_level: str
    findings: List[Dict[str, Any]] = field(default_factory=list)
    sanitized_input: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PromptScanResult":
        return cls(
            is_threat_detected=bool(data.get("isThreatDetected", False)),
            risk_score=float(data.get("riskScore", 0.0)),
            threat_level=data.get("threatLevel", "NONE"),
            findings=data.get("findings", []),
            sanitized_input=data.get("sanitizedInput", ""),
        )
