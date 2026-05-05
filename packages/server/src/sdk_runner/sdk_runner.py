"""Agent Runner — process registry + lifecycle management.

Manages running SDK subprocess tasks via asyncio. Tracks active runs
so they can be cancelled individually or cleaned up on shutdown.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from ..db import db
from ..logger import logger
from ..usage_utils import normalize_bearer_token
from .sdk_store import create_sdk_run, update_sdk_run, append_sdk_event
from .sdk_adapter import convert_sdk_message

Emitter = Callable[[dict[str, Any]], Awaitable[None]]
RunFinishedCallback = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class SdkProviderOptions:
    model: str | None
    env: dict[str, str]


def _normalize_anthropic_base_url(endpoint: str) -> str:
    normalized = endpoint.strip().rstrip("/")
    lower = normalized.lower()
    for suffix in (
        "/v1/messages",
        "/messages",
        "/v1/chat/completions",
        "/chat/completions",
        "/v1/responses",
        "/responses",
    ):
        if lower.endswith(suffix):
            normalized = normalized[: -len(suffix)].rstrip("/")
            lower = normalized.lower()
            break
    if lower.endswith("/v1"):
        normalized = normalized[:-3].rstrip("/")
    return normalized


def _is_official_anthropic_base_url(base_url: str) -> bool:
    return "api.anthropic.com" in base_url.lower()


def _resolve_sdk_provider_options(provider_id: str | None, model_override: str | None = None) -> SdkProviderOptions:
    if not provider_id:
        return SdkProviderOptions(model=model_override, env={})

    provider = db.query_one(
        "SELECT id, endpoint, api_key, model FROM providers WHERE id = ?",
        (provider_id,),
    )
    if not provider:
        raise RuntimeError("Provider not found")

    endpoint = str(provider.get("endpoint") or "").strip()
    model = model_override or str(provider.get("model") or "").strip()
    if not endpoint or not model:
        missing = ", ".join(
            name
            for name, value in (("endpoint", endpoint), ("model", model))
            if not value
        )
        raise RuntimeError(f"Provider {provider_id} is not fully configured: missing {missing}")

    base_url = _normalize_anthropic_base_url(endpoint)
    auth_token = normalize_bearer_token(str(provider.get("api_key") or ""))
    env = {
        "ANTHROPIC_BASE_URL": base_url,
        "ANTHROPIC_API_KEY": "",
        "ANTHROPIC_AUTH_TOKEN": "",
    }
    if auth_token:
        if _is_official_anthropic_base_url(base_url):
            env["ANTHROPIC_API_KEY"] = auth_token
        else:
            env["ANTHROPIC_AUTH_TOKEN"] = auth_token

    return SdkProviderOptions(model=model, env=env)


class ProcessRegistry:
    """In-memory registry of active SDK asyncio tasks."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}

    @property
    def active_run_ids(self) -> list[str]:
        return [rid for rid, t in self._tasks.items() if not t.done()]

    def is_running(self, run_id: str) -> bool:
        task = self._tasks.get(run_id)
        return task is not None and not task.done()

    def has_active_run_for_task(self, task_id: str, *, _get_run: Any = None) -> str | None:
        """Return the run_id if a run is active for the given task, else None.

        _get_run is injected in tests; production code passes sdk_store.get_sdk_run.
        """
        if _get_run is None:
            from .sdk_store import get_sdk_run as _get_run
        for rid in self.active_run_ids:
            run = _get_run(rid)
            if run and run["task_id"] == task_id:
                return rid
        return None

    def register(self, run_id: str, task: asyncio.Task[None]) -> None:
        self._tasks[run_id] = task

    async def wait(self, run_id: str, *, timeout: float | None = None) -> bool:
        task = self._tasks.get(run_id)
        if task is None:
            return False
        try:
            if timeout is None:
                await asyncio.shield(task)
            else:
                await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
        except asyncio.TimeoutError:
            return False
        return True

    def cancel(self, run_id: str) -> bool:
        task = self._tasks.get(run_id)
        if task is None or task.done():
            return False
        task.cancel()
        return True

    async def shutdown(self) -> int:
        """Cancel all active tasks and wait for them. Returns count cancelled."""
        active = [(rid, t) for rid, t in self._tasks.items() if not t.done()]
        for _, t in active:
            t.cancel()
        for _, t in active:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        count = len(active)
        self._tasks.clear()
        if count:
            logger.info("SDK ProcessRegistry: shut down %d task(s)", count)
        return count


# Singleton
registry = ProcessRegistry()


async def run_sdk_query(
    *,
    run_id: str,
    task_id: str,
    prompt: str,
    cwd: str,
    emitter: Emitter,
    system_prompt: str | None = None,
    provider_id: str | None = None,
    model_override: str | None = None,
    on_finished: RunFinishedCallback | None = None,
) -> None:
    """Execute a Claude Agent SDK query and stream events.

    This coroutine is meant to be wrapped in an asyncio.Task and registered
    with the ProcessRegistry.
    """
    try:
        update_sdk_run(run_id, status="running")
        await emitter({"type": "sdk_run.started", "run_id": run_id})
        append_sdk_event(run_id, event_type="sdk_run.started", payload_json={"prompt": prompt})

        try:
            from claude_agent_sdk import query, ClaudeAgentOptions
        except ImportError:
            error_msg = "claude-agent-sdk is not installed"
            update_sdk_run(run_id, status="failed", last_error=error_msg)
            append_sdk_event(run_id, event_type="sdk.error", payload_json={"message": error_msg})
            await emitter({"type": "sdk_run.failed", "run_id": run_id, "error": error_msg})
            if on_finished is not None:
                await on_finished({"run_id": run_id, "status": "failed", "error": error_msg})
            return

        provider_options = _resolve_sdk_provider_options(provider_id, model_override=model_override)
        options = ClaudeAgentOptions(
            cwd=cwd,
            model=provider_options.model,
            env=provider_options.env,
            permission_mode="acceptEdits",
            allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        )
        if system_prompt:
            options.system_prompt = system_prompt

        async for msg in query(prompt=prompt, options=options):
            events = convert_sdk_message(msg)
            for evt in events:
                append_sdk_event(run_id, event_type=evt["event_type"], payload_json=evt["payload"])
                await emitter({"type": evt["event_type"], "run_id": run_id, **evt["payload"]})

                # Update cost if available
                if evt["event_type"] == "sdk.cost_update":
                    cost = evt["payload"].get("total_cost_usd")
                    tokens = evt["payload"].get("usage", {}).get("total_tokens") if isinstance(evt["payload"].get("usage"), dict) else None
                    updates: dict[str, Any] = {}
                    if cost is not None:
                        updates["total_cost_usd"] = float(cost)
                    if tokens is not None:
                        updates["total_tokens"] = int(tokens)
                    if updates:
                        update_sdk_run(run_id, **updates)

        update_sdk_run(run_id, status="completed")
        append_sdk_event(run_id, event_type="sdk_run.completed")
        await emitter({"type": "sdk_run.completed", "run_id": run_id})
        if on_finished is not None:
            await on_finished({"run_id": run_id, "status": "completed"})

    except asyncio.CancelledError:
        update_sdk_run(run_id, status="cancelled")
        append_sdk_event(run_id, event_type="sdk_run.cancelled")
        try:
            await emitter({"type": "sdk_run.cancelled", "run_id": run_id})
        except Exception:
            pass
        if on_finished is not None:
            await on_finished({"run_id": run_id, "status": "cancelled"})

    except Exception as exc:
        error_msg = str(exc)
        logger.error("SDK run %s failed: %s", run_id, error_msg)
        update_sdk_run(run_id, status="failed", last_error=error_msg)
        append_sdk_event(run_id, event_type="sdk.error", payload_json={"message": error_msg})
        try:
            await emitter({"type": "sdk_run.failed", "run_id": run_id, "error": error_msg})
        except Exception:
            pass
        if on_finished is not None:
            await on_finished({"run_id": run_id, "status": "failed", "error": error_msg})


def start_sdk_run(
    *,
    task_id: str,
    prompt: str,
    cwd: str,
    emitter: Emitter,
    agent_run_id: str | None = None,
    provider_id: str | None = None,
    runner_type: str = "claude_code",
    model_override: str | None = None,
    system_prompt: str | None = None,
    on_finished: RunFinishedCallback | None = None,
) -> dict[str, Any]:
    """Create an SDK run record and start the background asyncio task.

    Returns the created sdk_run dict.
    """
    run = create_sdk_run(
        task_id,
        prompt=prompt,
        cwd=cwd,
        agent_run_id=agent_run_id,
        runner_type=runner_type,
    )
    run_id = run["id"]

    async_task = asyncio.get_event_loop().create_task(
        run_sdk_query(
            run_id=run_id,
            task_id=task_id,
            prompt=prompt,
            cwd=cwd,
            emitter=emitter,
            system_prompt=system_prompt,
            provider_id=provider_id,
            model_override=model_override,
            on_finished=on_finished,
        )
    )
    registry.register(run_id, async_task)
    return run
