"""SDK Approval Manager — async bridge for can_use_tool permission flow.

When the SDK requests permission for a tool (e.g. Bash), an approval request
is created here. The frontend posts approve/deny via HTTP, and the asyncio.Event
unblocks the SDK's can_use_tool callback.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any

from ..logger import logger

APPROVAL_TIMEOUT_SECONDS = 600  # 10 minutes


@dataclass
class PendingApproval:
    approval_id: str
    sdk_run_id: str
    tool_name: str
    tool_input: dict[str, Any]
    event: asyncio.Event = field(default_factory=asyncio.Event)
    approved: bool | None = None


class ApprovalManager:
    """Manages pending approval requests for SDK tool calls."""

    def __init__(self) -> None:
        self._pending: dict[str, PendingApproval] = {}

    def get_pending(self, approval_id: str) -> PendingApproval | None:
        return self._pending.get(approval_id)

    def list_pending_for_run(self, sdk_run_id: str) -> list[PendingApproval]:
        return [a for a in self._pending.values() if a.sdk_run_id == sdk_run_id and a.approved is None]

    async def request_approval(
        self,
        *,
        sdk_run_id: str,
        tool_name: str,
        tool_input: dict[str, Any],
    ) -> bool:
        """Create an approval request and wait for resolution or timeout.

        Returns True if approved, False if denied or timed out.
        """
        approval_id = str(uuid.uuid4())
        pending = PendingApproval(
            approval_id=approval_id,
            sdk_run_id=sdk_run_id,
            tool_name=tool_name,
            tool_input=tool_input,
        )
        self._pending[approval_id] = pending

        try:
            await asyncio.wait_for(pending.event.wait(), timeout=APPROVAL_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            pending.approved = False
            logger.info("SDK approval %s timed out (auto-deny)", approval_id)

        result = pending.approved is True
        self._pending.pop(approval_id, None)
        return result

    def resolve(self, approval_id: str, *, approved: bool) -> bool:
        """Resolve a pending approval. Returns False if not found."""
        pending = self._pending.get(approval_id)
        if pending is None:
            return False
        pending.approved = approved
        pending.event.set()
        return True

    def cancel_all_for_run(self, sdk_run_id: str) -> int:
        """Deny all pending approvals for a run. Returns count."""
        count = 0
        for pending in list(self._pending.values()):
            if pending.sdk_run_id == sdk_run_id and pending.approved is None:
                pending.approved = False
                pending.event.set()
                count += 1
        return count

    def clear(self) -> None:
        for pending in self._pending.values():
            if pending.approved is None:
                pending.approved = False
                pending.event.set()
        self._pending.clear()


# Singleton
approval_manager = ApprovalManager()
