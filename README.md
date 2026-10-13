# MindID Analytics Dashboard — POC

Read-only analytics dashboard for MindID mining operations. Displays whatever
output exists in Snowflake (forecasting is computed upstream by the data team).

## Layout

```
backend/    FastAPI — /api/dashboard + /api/ai/chat, provider pattern (mock | snowflake)
frontend/   React + Vite + TS + Tailwind + ECharts — config-driven widgets
mockup/     Approved static HTML mockup (design reference)
```

## Run

Backend:
```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py          # http://localhost:8000
```

Frontend:
```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173  (proxies /api → :8000)
```

## Mock → Snowflake swap

When the `ANALYTICS` schema lands:

1. `cp backend/.env.example backend/.env`, fill `SNOWFLAKE_*`, set `DATA_PROVIDER=snowflake`
2. Edit **only** `backend/app/data/queries.py` (view names + column aliases)
3. Restart — frontend unchanged.

## AI panel

Chat UI is live with canned replies from `/api/ai/chat`. LLM integration
(partner's key + model) plugs into `backend/app/routers/ai.py` — endpoint
contract stays the same.
