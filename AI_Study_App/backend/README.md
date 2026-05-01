# AI Study App — Backend

This is the FastAPI backend proxy for the AI Study App. The backend securely forwards frontend requests to a Flowise REST API endpoint and keeps secrets on the server side.

Setup
1. Create and activate a Python virtual environment.
2. Install dependencies:

```bash
pip install -r backend/requirements.txt
```

3. Copy the example env and set your Flowise endpoint (do NOT commit real secrets):

```bash
cp backend/.env.example backend/.env
# edit backend/.env and set FLOWISE_API_URL and FLOWISE_BEARER_TOKEN (if required)
```

Run (development)

```bash
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

API
- `GET /health` — basic health check.
- `POST /api/query` — forward a query to Flowise. Request body JSON:

```json
{
  "question": "Explain closures in Python",
  "sessionId": "uuid-v4-session-id",
  "metadata": { "topic": "python" }
}
```

Response: JSON wrapper with `ok` and `data` containing Flowise's response.

Notes
- The frontend must never see `FLOWISE_API_URL` or `FLOWISE_BEARER_TOKEN` — send requests only to this backend.
- CORS is permissive to allow local frontend testing; restrict in production.
