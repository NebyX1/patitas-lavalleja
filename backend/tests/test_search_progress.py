import json
import asyncio

import pytest
from sqlalchemy import delete

from app.ai.search import IntelligenceService
from app.db.models import AuthSession, Pet
from app.main import SafetyHeaders
from conftest import create_published, login
from test_ai import animal, settings


def test_stream_disconnect_wait_is_not_limited_by_finished_upload(monkeypatch):
    original = asyncio.wait_for
    waits = []
    async def upload_wait(awaitable, timeout):
        waits.append(timeout)
        assert len(waits) == 1, "Only upload reads should use the upload deadline"
        return await original(awaitable, timeout)
    monkeypatch.setattr("app.main.asyncio.wait_for", upload_wait)
    async def run():
        reads = 0
        async def receive():
            nonlocal reads
            reads += 1
            return {"type": "http.request", "body": b"{}", "more_body": False} if reads == 1 else {"type": "http.disconnect"}
        async def send(message):
            pass
        async def app(scope, receive, send):
            assert (await receive())["type"] == "http.request"
            assert (await receive())["type"] == "http.disconnect"
        await SafetyHeaders(app)({"type": "http", "path": "/api/v1/matches/search", "headers": []}, receive, send)
    asyncio.run(run())
    assert len(waits) == 1


def test_pipeline_reports_actual_model_success_and_degradation(tmp_path):
    service = IntelligenceService(settings(tmp_path, ai_enabled=True, rerank_enabled=True))
    class Models:
        def embed(self, texts, **kwargs):
            return [[1.0] + [0.0] * 383]
        def rerank(self, query, documents):
            return [0.8] * len(documents)
    service.models = Models()
    events = []
    result = service.search([animal()], {"activity_minutes": 60}, "compañía", progress=events.append)
    assert result["results"]
    assert [(e["stage"], e["state"]) for e in events if e["stage"] == "embedding"] == [("embedding", "running"), ("embedding", "complete")]
    assert [(e["stage"], e["state"]) for e in events if e["stage"] == "reranker"] == [("reranker", "running"), ("reranker", "complete")]
    assert events[1]["profiles"] == events[1]["eligible"] == 1
    def unavailable(*args, **kwargs):
        raise RuntimeError("internal error must not reach the stream")
    service.models.embed = service.models.rerank = unavailable
    degraded = []
    service.search([animal()], {}, "compañía", progress=degraded.append)
    assert next(e for e in degraded if e["stage"] == "embedding" and e["state"] != "running")["state"] == "unavailable"
    assert next(e for e in degraded if e["stage"] == "reranker" and e["state"] != "running")["state"] == "unavailable"


def test_stream_authentication_counts_result_and_json_compatibility(system):
    client, _ = system
    route = "/api/v1/matches/search"
    accept = {"Accept": "application/x-ndjson"}
    assert client.post(route, json={"profile": {}}, headers=accept).status_code == 401
    auth = login(client)
    pet = create_published(client, auth)
    assert client.post(route, json={"profile": {}}, headers=accept).status_code == 403
    assert client.post(route, json={"profile": {}}, headers={**auth, **accept, "Origin": "https://untrusted.test"}).status_code == 403
    result = client.post(route, json={"profile": {}}, headers={**auth, **accept})
    assert result.status_code == 200 and result.headers["content-type"].startswith("application/x-ndjson")
    assert result.headers["cache-control"] == "no-store" and result.headers["x-accel-buffering"] == "no"
    events = [json.loads(line) for line in result.text.splitlines()]
    assert events[-1]["type"] == "result" and events[-1]["data"]["results"][0]["pet"]["id"] == pet["id"]
    assert events[1]["profiles"] == 1
    assert next(e for e in events if e.get("stage") == "embedding")["state"] == "disabled"
    assert not any("profile" in event or "query" in event for event in events[:-1])
    assert client.post(route, json={"profile": {}}, headers=auth).headers["content-type"].startswith("application/json")


def test_cancelled_progress_stops_before_scheduling_a_model(tmp_path):
    service = IntelligenceService(settings(tmp_path, ai_enabled=True, rerank_enabled=True))
    class Cancelled(Exception):
        pass
    class Models:
        def embed(self, *args, **kwargs):
            raise AssertionError("cancelled searches must not schedule another model")
    service.models = Models()
    def stop(event):
        if event["stage"] == "embedding":
            raise Cancelled()
    with pytest.raises(Cancelled):
        service.search([animal()], {}, "compañía", progress=stop)


@pytest.mark.parametrize("change", ["pet", "session", "failure"])
def test_stream_revalidates_visibility_session_and_sanitizes_errors(system, monkeypatch, change):
    client, app = system
    auth = login(client)
    pet = create_published(client, auth)
    search = app.state.intelligence.search
    def during_search(*args, **kwargs):
        if change == "failure":
            raise RuntimeError("PRIVATE_MODEL_INPUT")
        result = search(*args, **kwargs)
        with app.state.db_factory() as db:
            if change == "pet":
                db.get(Pet, pet["id"]).publication_status = "draft"
            else:
                db.execute(delete(AuthSession).where(AuthSession.user_id == "admin"))
            db.commit()
        return result
    monkeypatch.setattr(app.state.intelligence, "search", during_search)
    response = client.post("/api/v1/matches/search", json={"profile": {}}, headers={**auth, "Accept": "application/x-ndjson"})
    events = [json.loads(line) for line in response.text.splitlines()]
    assert "PRIVATE_MODEL_INPUT" not in response.text
    if change == "pet":
        assert events[-1]["data"]["results"] == []
        assert events[-1]["data"]["meta"]["availability_changed"]
    else:
        assert events[-1]["type"] == "error"
        assert events[-1]["code"] == ("http_401" if change == "session" else "search_unavailable")
        assert not any(e["type"] == "result" for e in events)
