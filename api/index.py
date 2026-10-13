"""Vercel serverless entry — wraps the FastAPI app living in backend/.

Vercel detects `app` (ASGI) automatically; routes are re-routed here by
vercel.json for every /api/* request.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app  # noqa: E402
