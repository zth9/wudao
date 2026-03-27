from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, AsyncGenerator


class AgentRunBroker:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._backlogs: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any] | None]]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def start(
        self,
        event_source: AsyncGenerator[dict[str, Any], None],
    ) -> str:
        first_event = await anext(event_source)
        run_id = str(first_event.get("runId") or "")
        if not run_id:
            raise RuntimeError("agent run did not emit run.started")

        async with self._lock:
            self._backlogs[run_id].append(first_event)
            self._tasks[run_id] = asyncio.create_task(self._drain(run_id, event_source))
        return run_id

    async def _drain(
        self,
        run_id: str,
        event_source: AsyncGenerator[dict[str, Any], None],
    ) -> None:
        try:
            async for event in event_source:
                await self.publish(run_id, event)
        finally:
            async with self._lock:
                subscribers = list(self._subscribers.get(run_id, []))
                for queue in subscribers:
                    await queue.put(None)
                self._tasks.pop(run_id, None)

    async def publish(self, run_id: str, event: dict[str, Any]) -> None:
        async with self._lock:
            backlog = self._backlogs[run_id]
            backlog.append(event)
            if len(backlog) > 512:
                del backlog[: len(backlog) - 512]
            subscribers = list(self._subscribers.get(run_id, []))
        for queue in subscribers:
            await queue.put(event)

    async def subscribe(self, run_id: str) -> asyncio.Queue[dict[str, Any] | None]:
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        async with self._lock:
            for event in self._backlogs.get(run_id, []):
                await queue.put(event)
            self._subscribers[run_id].append(queue)
            task = self._tasks.get(run_id)
            if task is None or task.done():
                await queue.put(None)
        return queue

    async def unsubscribe(self, run_id: str, queue: asyncio.Queue[dict[str, Any] | None]) -> None:
        async with self._lock:
            subscribers = self._subscribers.get(run_id)
            if not subscribers:
                return
            if queue in subscribers:
                subscribers.remove(queue)
            if not subscribers:
                self._subscribers.pop(run_id, None)


agent_run_broker = AgentRunBroker()
