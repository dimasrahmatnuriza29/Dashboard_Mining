from __future__ import annotations

import json
import logging
import re

import requests
from fastapi import APIRouter

from app.config import settings
from app.schemas import (
    ChatRequest,
    ChatResponse,
    Finding,
    InsightRequest,
    InsightResponse,
    Recommendation,
)

router = APIRouter(prefix="/ai", tags=["ai"])
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


INSIGHT_PROMPT = """Kamu adalah analis operasional senior pertambangan untuk grup MIND ID
(ANTAM, PTBA, TIMAH, INALUM). Tugasmu: membaca SELURUH data dashboard di bawah,
mengidentifikasi temuan penting, menjelaskannya secara detail, lalu memberi
rekomendasi yang detail dan bisa langsung dieksekusi. Bahasa Indonesia.

Data dashboard (snapshot JSON):
{context}

Cara menganalisis:
- Bandingkan achievement vs target (< 90% = masalah, >= 100% = baik).
- Bandingkan downtime bulan ini vs rata-rata 6 bulan per site (lonjakan > 20% = anomali).
- Perhatikan delta KPI month-over-month, forecast delta, dan YTD achievement.
- Lihat konsentrasi komposisi komoditas (risiko ketergantungan).
- Prioritaskan temuan berdasarkan dampak ke produksi/revenue.

Aturan:
- Setiap temuan dan rekomendasi WAJIB menyebut angka dan nama site/PT/komoditas dari data.
- Jangan mengarang angka. Pengetahuan umum industri tambang boleh dipakai untuk
  menjelaskan kemungkinan penyebab dan langkah perbaikan, tapi tandai sebagai dugaan.
- Balas SELALU JSON murni tanpa markdown fence, dengan struktur:
  {{"summary": "<2-3 kalimat ringkasan kondisi; boleh <b> untuk angka kunci>",
    "findings": [{{"severity": "high|medium|low",
                   "title": "<judul singkat temuan>",
                   "detail": "<penjelasan detail: apa yang terjadi, angka pendukung,
                              pembanding, kemungkinan penyebab, dampak>"}}],
    "recommendations": [{{"level": "warning|opportunity|info",
                          "tag": "<LEVEL · SUBJEK, contoh: WARNING · TIMAH-SITE-02>",
                          "text": "<rekomendasi detail: tindakan konkret, langkah-langkah,
                                   penanggung jawab, target waktu, dan dampak yang diharapkan>"}}]}}
- 3-6 temuan (urut dari severity tertinggi), 3-5 rekomendasi."""


def _call_llm(messages: list[dict], max_tokens: int | None = None) -> dict:
    payload = {
        "model": settings.chat_model,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.4,
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    r = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "X-Title": "MindID Analytics POC",
        },
        json=payload,
        timeout=120,
    )
    r.raise_for_status()
    raw = r.json()["choices"][0]["message"]["content"] or ""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:  # model leaked prose — salvage the JSON block
        m = re.search(r"\{.*\}", raw, re.S)
        return json.loads(m.group(0)) if m else {"reply": raw, "summary": raw}


def _parse_recs(items, limit: int) -> list[Recommendation]:
    return [
        Recommendation(level=r_["level"], tag=r_["tag"], text=r_["text"])
        for r_ in items or []
        if isinstance(r_, dict)
        and r_.get("level") in ("warning", "opportunity", "info")
        and r_.get("tag")
        and r_.get("text")
    ][:limit]


def _ctx(context: dict) -> str:
    return json.dumps(context, ensure_ascii=False, default=str) if context else "(tidak ada)"


def _ask_llm(req: ChatRequest) -> ChatResponse:
    context = _ctx(req.context)
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(context=context)}]
    messages += [{"role": m.role, "content": m.content} for m in req.history[-10:]]
    messages.append({"role": "user", "content": req.message})

    parsed = _call_llm(messages)
    return ChatResponse(
        reply=parsed.get("reply") or "Maaf, tidak ada jawaban.",
        recommendations=_parse_recs(parsed.get("recommendations"), 3),
    )


@router.post("/insights", response_model=InsightResponse)
def insights(req: InsightRequest) -> InsightResponse:
    if not settings.openrouter_api_key or not settings.chat_model:
        return InsightResponse(summary="LLM belum dikonfigurasi — set OPENROUTER_API_KEY dan CHAT_MODEL.")
    messages = [
        {"role": "system", "content": INSIGHT_PROMPT.format(context=_ctx(req.context))},
        {"role": "user", "content": "Analisis dashboard ini: identifikasi temuan dan beri rekomendasi detail."},
    ]
    try:
        parsed = _call_llm(messages)
        findings = [
            Finding(severity=f["severity"], title=f["title"], detail=f["detail"])
            for f in parsed.get("findings") or []
            if isinstance(f, dict)
            and f.get("severity") in ("high", "medium", "low")
            and f.get("title")
            and f.get("detail")
        ][:6]
        return InsightResponse(
            summary=parsed.get("summary") or "Analisis selesai.",
            findings=findings,
            recommendations=_parse_recs(parsed.get("recommendations"), 5),
        )
    except requests.RequestException as exc:
        log.warning("OpenRouter insight call failed: %s", exc)
        return InsightResponse(summary="Maaf, koneksi ke model AI gagal saat menganalisis dashboard.")
    except Exception as exc:
        log.warning("Insight parse failed: %s", exc)
        return InsightResponse(summary="Maaf, hasil analisis AI tidak bisa diproses.")


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
