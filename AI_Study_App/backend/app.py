from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, Any
from pathlib import Path
import os
import logging
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# Load environment from backend/.env (do not hardcode secrets)
base_dir = os.path.dirname(__file__)
env_path = os.path.join(base_dir, ".env")
load_dotenv(env_path)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = PROJECT_ROOT / "frontend" / "index.html"

FLOWISE_API_URL = os.getenv("FLOWISE_API_URL")
FLOWISE_BEARER_TOKEN = os.getenv("FLOWISE_BEARER_TOKEN")
FLOWISE_TIMEOUT = int(os.getenv("FLOWISE_TIMEOUT", "15"))

if not FLOWISE_API_URL:
    raise RuntimeError("FLOWISE_API_URL is not set. Copy .env.example to .env and set it.")


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("ai-study-backend")


class QueryRequest(BaseModel):
    question: str
    sessionId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


app = FastAPI(title="AI Study App — Backend Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all origins for local testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files from frontend folder
FRONTEND_DIR = PROJECT_ROOT / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="frontend")


def _build_session(timeout_seconds: int = FLOWISE_TIMEOUT) -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=0.3,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"Content-Type": "application/json"})
    if FLOWISE_BEARER_TOKEN:
        session.headers.update({"Authorization": f"Bearer {FLOWISE_BEARER_TOKEN}"})
    session.timeout = timeout_seconds
    return session


def query_flowise(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Send the payload to Flowise and return parsed JSON.

    This centralizes error handling, retries, and header management.
    """
    session = _build_session()
    try:
        resp = session.post(FLOWISE_API_URL, json=payload, timeout=90)
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.exception("Error while calling Flowise API: %s", exc)
        raise
    try:
        return resp.json()
    except ValueError:
        # Unexpected non-JSON response
        logger.error("Flowise returned non-JSON response: %s", resp.text)
        raise


@app.get("/", include_in_schema=False)
def serve_index():
    if not INDEX_PATH.exists():
        raise HTTPException(status_code=404, detail="frontend/index.html not found")
    return FileResponse(INDEX_PATH)


@app.get("/health")
def health():
    return {"ok": True, "flowise_configured": bool(FLOWISE_API_URL)}


@app.post("/api/chat")
def proxy_chat(req: QueryRequest):
    """Proxy endpoint that forwards client requests to Flowise.

    Expected JSON body: { "question": "...", "sessionId": "uuid", "metadata": {...} }
    """
    payload: Dict[str, Any] = {"question": req.question}
    if req.sessionId:
        # Flowise deployments vary by version/config.
        # Send session identity in common accepted locations to preserve memory.
        payload["sessionId"] = req.sessionId
        payload["chatId"] = req.sessionId
        payload["overrideConfig"] = {
            "sessionId": req.sessionId,
            "chatId": req.sessionId,
        }
    if req.metadata:
        payload["metadata"] = req.metadata

        # Preserve any existing overrideConfig keys while enforcing session continuity.
        if isinstance(req.metadata.get("overrideConfig"), dict):
            payload["overrideConfig"] = {
                **req.metadata["overrideConfig"],
                "sessionId": req.sessionId or req.metadata["overrideConfig"].get("sessionId"),
                "chatId": req.sessionId or req.metadata["overrideConfig"].get("chatId"),
            }

    logger.info(
        "Proxying query for session=%s with flowise keys=%s",
        req.sessionId,
        [k for k in ("sessionId", "chatId", "overrideConfig") if k in payload],
    )

    try:
        result = query_flowise(payload)
    except requests.exceptions.HTTPError as http_err:
        status = getattr(http_err.response, "status_code", 502)
        detail = getattr(http_err.response, "text", str(http_err))
        logger.error("Flowise HTTP error %s: %s", status, detail)
        raise HTTPException(status_code=status, detail=f"Flowise error: {detail}")
    except requests.exceptions.RequestException as err:
        logger.error("Flowise request failed: %s", err)
        raise HTTPException(status_code=502, detail="Failed to contact Flowise API")
    except Exception as err:
        logger.exception("Unexpected error while querying Flowise: %s", err)
        raise HTTPException(status_code=500, detail="Internal server error")

    # Return Flowise response directly — the frontend will render markdown, code blocks, etc.
    return {"ok": True, "data": result}


@app.post("/api/query")
def proxy_query(req: QueryRequest):
    # Backward-compatible alias for older clients.
    return proxy_chat(req)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.app:app", host="0.0.0.0", port=port, log_level="info")
