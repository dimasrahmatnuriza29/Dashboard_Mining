from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import ai, dashboard

app = FastAPI(title="MindID Analytics API", version="0.1.0")


@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    """Vercel strips /api when routing to this service; local dev keeps it.
    Normalize so routes are defined without the prefix either way."""
    path = request.scope["path"]
    if path == "/api":
        request.scope["path"] = "/"
    elif path.startswith("/api/"):
        request.scope["path"] = path[4:]
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(ai.router)


@app.get("/")
def root() -> dict:
    return {"service": "mindid-backend", "status": "ok"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "data_provider": settings.data_provider}
