# codesec-agentguard (Python SDK)

Official Python SDK for the **AgentGuard** AI Agent Security Gateway.

AgentGuard intercepts, evaluates, and verifies autonomous AI agent actions against deterministic spending limits, currency controls, capability whitelists, and adversarial prompt injection heuristic scans before downstream payment APIs (such as Razorpay or PayPal) are executed.

---

## Installation

```bash
pip install codesec-agentguard
```

Or install locally in editable mode:

```bash
pip install -e packages/python-sdk
```

---

## Quickstart

```python
import os
from agentguard import AgentGuard

# Initialize client
guard = AgentGuard(
    base_url=os.environ.get("AGENTGUARD_URL", "http://localhost:3001"),
    api_key=os.environ["AGENTGUARD_API_KEY"],
    timeout=5.0,
)

# Pre-flight evaluation
decision = guard.evaluate({
    "action": "payment.create",
    "amount": 1200.0,
    "currency": "INR",
    "recipient": "merchant@store.com",
    "description": "Autonomous grocery restocking order",
    "prompt_context": "User prompt: Restock organic coffee beans.",
})

if decision.status == "ALLOW":
    print(f"Action permitted! Policy version: {decision.policy_version}")
    # Safe to initiate Razorpay order
elif decision.status == "HOLD":
    print(f"Action held for human review: {decision.pending_approval_id}")
    # Wait for operator in AgentGuard dashboard
else:
    print(f"Blocked by AgentGuard: {decision.reason}")
    for violation in decision.violations:
        print(f" - {violation}")
```

### Context Manager Usage

```python
with AgentGuard(base_url="http://localhost:3001", api_key="ag_live_...") as guard:
    decision = guard.evaluate(action="payment.create", amount=25.0)
    if decision.is_allowed:
        pass
```

### Strict Fail-Closed Guarantee

```python
# evaluate_safely catches all timeouts, DNS failures, and gateway crashes,
# strictly returning an authoritative BLOCK decision so your code never fails open.
decision = guard.evaluate_safely(action="payment.create", amount=50.0)
if not decision.is_allowed:
    print(f"Transaction denied: {decision.reason}")
```

---

## License

MIT © AgentGuard Security Team
