from __future__ import annotations

import json
import logging
import re

import requests
from fastapi import APIRouter

from app.config import settings
from app.schemas import ChatRequest, ChatResponse, Recommendation

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """Kamu adalah MindID Assistant — analis operasional tambang untuk grup MIND ID
(ANTAM, PTBA, TIMAH, INALUM). Jawab selalu dalam Bahasa Indonesia, ringkas dan
berbasis ANGKA dari konteks data dashboard yang disediakan di bawah.

Konteks data dashboard (snapshot JSON):
{context}

Aturan:
- Selalu kutip angka/nama site/PT dari konteks bila relevan. Jangan mengarang data.
- Kalau pertanyaan di luar data, jawab dari pengetahuanmu tapi tandai bahwa itu
  bukan dari dashboard.
- Balas SELALU sebagai JSON murni tanpa markdown fence:
  {{"reply": "<teks HTML singkat; boleh <b> untuk angka kunci>",
    "recommendations": [{{"level": "warning|opportunity|info",
                          "tag": "TAG · SUBJEK", "text": "…"}}]}}
  "recommendations" opsional — maks 3, hanya kalau ada insight actionable."""


def _ask_llm(req: ChatRequest) -> ChatResponse:
    context = json.dumps(req.context, ensure_ascii=False, default=str) if req.context else "(tidak ada)"
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(context=context)}]
    messages += [{"role": m.role, "content": m.content} for m in req.history[-10:]]
    messages.append({"role": "user", "content": req.message})

    r = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "X-Title": "MindID Analytics POC",
        },
        json={
            "model": settings.chat_model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.4,
        },
        timeout=60,
    )
    r.raise_for_status()
    raw = r.json()["choices"][0]["message"]["content"]

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:  # model leaked prose — salvage the JSON block
        m = re.search(r"\{.*\}", raw, re.S)
        parsed = json.loads(m.group(0)) if m else {"reply": raw}

    recs = [
        Recommendation(level=r_["level"], tag=r_["tag"], text=r_["text"])
        for r_ in parsed.get("recommendations") or []
        if r_.get("level") in ("warning", "opportunity", "info") and r_.get("tag") and r_.get("text")
    ][:3]
    return ChatResponse(reply=parsed.get("reply") or raw, recommendations=recs)


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    if not req.message.strip():
        return ChatResponse(reply="Silakan ketik pertanyaan tentang data operasional.")
    if not settings.openrouter_api_key or not settings.chat_model:
        return ChatResponse(reply="LLM belum dikonfigurasi — set OPENROUTER_API_KEY dan CHAT_MODEL di .env.")
    try:
        return _ask_llm(req)
    except requests.RequestException as exc:
        log.warning("OpenRouter call failed: %s", exc)
        return ChatResponse(reply="Maaf, koneksi ke model AI gagal. Coba lagi beberapa saat.")
    except Exception as exc:  # malformed model output
        log.warning("LLM response parse failed: %s", exc)
        return ChatResponse(reply="Maaf, respons AI tidak bisa diproses. Coba ulangi pertanyaannya.")
