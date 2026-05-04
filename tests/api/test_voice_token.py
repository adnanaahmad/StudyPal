import importlib
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

pytest.importorskip("fastapi")

FastAPI = pytest.importorskip("fastapi").FastAPI
TestClient = pytest.importorskip("fastapi.testclient").TestClient
router = importlib.import_module("deeptutor.api.routers.voice").router


def _build_app():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/voice")
    return app


@pytest.fixture
def client():
    return TestClient(_build_app())


def test_voice_token_bot_not_found(client):
    with patch("deeptutor.api.routers.voice.get_tutorbot_manager") as mock_mgr:
        mgr = MagicMock()
        mgr.get_bot.return_value = None
        mgr._load_bot_config.return_value = None
        mock_mgr.return_value = mgr
        resp = client.post("/api/v1/voice/token?bot_id=nonexistent")
    assert resp.status_code == 404


def test_voice_token_bot_not_running(client):
    with patch("deeptutor.api.routers.voice.get_tutorbot_manager") as mock_mgr:
        mgr = MagicMock()
        mgr.get_bot.return_value = None
        cfg = MagicMock()
        cfg.name = "MathBot"
        mgr._load_bot_config.return_value = cfg
        mock_mgr.return_value = mgr
        resp = client.post("/api/v1/voice/token?bot_id=mathbot")
    assert resp.status_code == 409
    assert "not running" in resp.json()["detail"].lower()


def test_voice_token_success_with_bot(client):
    fake_vb_response = {
        "token": "tok_abc",
        "livekit_url": "wss://lk.example.com",
        "room_name": "room-123",
        "expires_in": 3600,
    }
    with (
        patch("deeptutor.api.routers.voice.get_tutorbot_manager") as mock_mgr,
        patch("deeptutor.api.routers.voice.httpx.AsyncClient") as mock_http,
    ):
        instance = MagicMock()
        instance.config.name = "MathBot"
        mgr = MagicMock()
        mgr.get_bot.return_value = instance
        mock_mgr.return_value = mgr

        http_instance = AsyncMock()
        http_instance.__aenter__ = AsyncMock(return_value=http_instance)
        http_instance.__aexit__ = AsyncMock(return_value=False)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = fake_vb_response
        mock_response.raise_for_status = MagicMock()
        http_instance.post = AsyncMock(return_value=mock_response)
        mock_http.return_value = http_instance

        resp = client.post("/api/v1/voice/token?bot_id=mathbot")

    assert resp.status_code == 200
    data = resp.json()
    assert data["token"] == "tok_abc"
    assert data["livekit_url"] == "wss://lk.example.com"
    assert data["room_name"] == "room-123"
    assert data["expires_in"] == 3600


def test_voice_token_success_no_bot(client):
    fake_vb_response = {
        "token": "tok_gen",
        "livekit_url": "wss://lk.example.com",
        "room_name": "room-gen",
        "expires_in": 3600,
    }
    with (
        patch("deeptutor.api.routers.voice.get_tutorbot_manager") as mock_mgr,
        patch("deeptutor.api.routers.voice.httpx.AsyncClient") as mock_http,
    ):
        mgr = MagicMock()
        mock_mgr.return_value = mgr

        http_instance = AsyncMock()
        http_instance.__aenter__ = AsyncMock(return_value=http_instance)
        http_instance.__aexit__ = AsyncMock(return_value=False)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = fake_vb_response
        mock_response.raise_for_status = MagicMock()
        http_instance.post = AsyncMock(return_value=mock_response)
        mock_http.return_value = http_instance

        resp = client.post("/api/v1/voice/token")

    assert resp.status_code == 200
    data = resp.json()
    assert data["token"] == "tok_gen"
    assert data["room_name"] == "room-gen"
