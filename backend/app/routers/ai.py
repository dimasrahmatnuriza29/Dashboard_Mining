from __future__ import annotations

import hashlib
import json
import logging
import re
import time

import requests
from fastapi import APIRouter

from app.config import settings
from app.schemas import (
    ChatRequest,
    ChatResponse,
    Finding,
    InsightRequest,
    InsightResponse,
    KeyInsight,
    Recommendation,
    VizSpec,
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
                          "tag": "TAG · SUBJEK", "text": "…"}}],
  "viz": {{"kind": "bar|line|pie", "title": "…",
           "x": ["label", …], "series": [{{"name": "…", "data": [n, …]}}]}}
  }}
  "recommendations" opsional — maks 3, hanya kalau ada insight actionable.
  "viz" opsional — isi hanya kalau jawaban lebih jelas dengan grafik
  (misal perbandingan PT/komoditas). Angka WAJIB dari konteks dashboard."""


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
- `commodity_detail` berisi proyeksi & delta per PT×komoditas — wajib dipakai untuk
  temuan forecast: sebutkan PT + nama komoditas + nilai + delta-nya, bukan agregat saja.
- WAJIB ada minimal satu temuan forecasting: jelaskan proyeksi akhir tahun vs target
  tahunan, deretan forecast bulanan (trend.forecast / card_selection), dan PT×komoditas
  mana yang menjadi driver gap — bukan hanya status gap.
- Rekomendasi WAJIB menjawab forecasting: minimal satu aksi kuantitatif untuk menutup
  gap forecast (sebutkan berapa Mt/unit di PT/komoditas mana, bulan berapa).
- SCOPE WAJIB: analisis HANYA data yang ada di konteks. Dilarang menyebut PT,
  komoditas, atau site yang tidak ada di dalam konteks (pt_filter/card_selection
  menandai scope aktif).
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
                                   penanggung jawab, target waktu, dan dampak yang diharapkan>"}}],
    "key_insights": [{{"kind": "check|warn", "text": "<observasi 1 kalimat dari data;
                          kind=warn untuk masalah/risiko, check untuk yang sehat>"}}],
    "next_actions": ["<langkah konkret singkat, satu kalimat>"]}}
  key_insights: 4-6 item. next_actions: 4-5 item, actionable & spesifik ke scope.
- 3-6 temuan (urut dari severity tertinggi), 3-5 rekomendasi.
- Opsional: tambahkan "viz" kalau ada perbandingan/tren yang lebih jelas
  divisualkan, dengan skema
  "viz": {{"kind": "bar|line|pie", "title": "…",
           "x": ["label", …], "series": [{{"name": "…", "data": [n, …]}}]}}
  Angka WAJIB dari konteks dashboard, bukan karangan."""


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


def _viz(raw) -> VizSpec | None:
    def _num(v) -> float | None:
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    if not isinstance(raw, dict):
        return None
    series = [
        {"name": str(s.get("name", "")), "data": [_num(v) for v in s.get("data") or []]}
        for s in raw.get("series") or []
        if isinstance(s, dict) and s.get("data")
    ]
    if not series or not raw.get("x"):
        return None
    kind = raw.get("kind") if raw.get("kind") in ("bar", "line", "pie") else "bar"
    return VizSpec(kind=kind, title=str(raw.get("title", "")),
                   x=[str(v) for v in raw["x"]], series=series)


def _ask_llm(req: ChatRequest) -> ChatResponse:
    context = _ctx(req.context)
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(context=context)}]
    messages += [{"role": m.role, "content": m.content} for m in req.history[-10:]]
    messages.append({"role": "user", "content": req.message})

    parsed = _call_llm(messages)
    return ChatResponse(
        reply=parsed.get("reply") or "Maaf, tidak ada jawaban.",
        recommendations=_parse_recs(parsed.get("recommendations"), 3),
        viz=_viz(parsed.get("viz")),
    )


INSIGHT_WASTE_PROMPT = """Kamu adalah analis senior waste management & circular economy
untuk grup MIND ID (ANTAM, PTBA, TIMAH, INALUM). Tugasmu: membaca SELURUH data
dashboard waste intelligence di bawah, mengidentifikasi temuan penting, menjelaskannya
secara detail, lalu memberi rekomendasi yang detail dan bisa langsung dieksekusi.
Bahasa Indonesia.

Data dashboard (snapshot JSON):
{context}

Cara menganalisis:
- WAJIB bahas SEMUA PT yang ada di konteks (lihat pt_details, utilization_by_pt,
  realization_by_pt) — jangan hanya satu PT. Setiap PT minimal disebut sekali dalam
  summary atau findings, dengan angka masing-masing.
- Bandingkan utilization per PT (utilization_by_pt, pt_details.utilization_pct):
  < 60% = masalah, >= 75% = baik. Jelaskan gap antar-PT dan penyebab yang masuk akal.
- Nilai revenue: bandingkan potential vs realized (revenue_potential_vs_realized,
  realization_by_pt) — hitung gapnya per PT dan agregat.
- Pakai quality_gap_reasons untuk menjelaskan waste yang tidak lolos kualitas
  dan menghubungkannya dengan realization gap.
- Pakai top_opportunities untuk merekomendasikan prioritas monetisasi.
- Pakai KPIs untuk konteks zero-waste progress dan volume total per periode.
- Pakai waste_composition untuk konsentrasi jenis waste per segmen.

Aturan:
- Setiap temuan dan rekomendasi WAJIB menyebut angka dan nama PT/jenis waste dari data.
- SCOPE WAJIB: analisis HANYA data yang ada di konteks. Dilarang menyebut PT, site,
  atau jenis waste yang tidak ada di konteks.
- Jangan mengarang angka. Pengetahuan umum industri waste management boleh dipakai
  untuk menjelaskan kemungkinan penyebab dan langkah perbaikan, tapi tandai sebagai
  dugaan.
- Balas SELALU JSON murni tanpa markdown fence, dengan struktur:
  {{"summary": "<2-3 kalimat ringkasan kondisi; boleh <b> untuk angka kunci; harus
               menyentuh semua PT>",
    "findings": [{{"severity": "high|medium|low",
                   "title": "<judul singkat temuan>",
                   "detail": "<penjelasan detail: apa yang terjadi, angka pendukung,
                              pembanding antar-PT, kemungkinan penyebab, dampak>"}}],
    "recommendations": [{{"level": "warning|opportunity|info",
                          "tag": "<LEVEL · SUBJEK, contoh: WARNING · INALUM>",
                          "text": "<rekomendasi detail: tindakan konkret, langkah-langkah,
                                   penanggung jawab, target waktu, dan dampak yang diharapkan>"}}],
    "key_insights": [{{"kind": "check|warn", "text": "<observasi 1 kalimat dari data;
                          kind=warn untuk masalah/risiko, check untuk yang sehat>"}}],
    "next_actions": ["<langkah konkret singkat, satu kalimat>"]}}
  key_insights: 4-6 item, sebarkan di semua PT (jangan semua satu PT).
  next_actions: 4-5 item, actionable & spesifik.
- 4-6 temuan (urut dari severity tertinggi), 3-5 rekomendasi — pastikan temuan
  mencakup lebih dari satu PT bila memang ada isu di lebih dari satu PT.
- Opsional: tambahkan "viz" kalau ada perbandingan/tren yang lebih jelas
  divisualkan (misal utilization antar-PT), dengan skema
  "viz": {{"kind": "bar|line|pie", "title": "…",
           "x": ["label", …], "series": [{{"name": "…", "data": [n, …]}}]}}
  Angka WAJIB dari konteks dashboard, bukan karangan."""


_INS_TTL = 1800
_ins_cache: dict[str, tuple[float, InsightResponse]] = {}


@router.post("/insights", response_model=InsightResponse)
def insights(req: InsightRequest) -> InsightResponse:
    key = hashlib.sha256(
        json.dumps(req.context, ensure_ascii=False, sort_keys=True, default=str).encode()
    ).hexdigest()
    hit = _ins_cache.get(key)
    if hit and time.time() - hit[0] < _INS_TTL:
        return hit[1]
    resp = _gen_insight(req)
    resp.generated_at = time.strftime("%H:%M")
    _ins_cache[key] = (time.time(), resp)
    return resp


def _gen_insight(req: InsightRequest) -> InsightResponse:
    if not settings.openrouter_api_key or not settings.chat_model:
        return InsightResponse(summary="LLM belum dikonfigurasi — set OPENROUTER_API_KEY dan CHAT_MODEL.")
    prompt = INSIGHT_WASTE_PROMPT if req.context.get("dashboard") == "waste" else INSIGHT_PROMPT
    messages = [
        {"role": "system", "content": prompt.format(context=_ctx(req.context))},
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
            viz=_viz(parsed.get("viz")),
            key_insights=[
                KeyInsight(kind=k["kind"], text=k["text"])
                for k in parsed.get("key_insights") or []
                if isinstance(k, dict) and k.get("kind") in ("check", "warn") and k.get("text")
            ][:6],
            next_actions=[str(a) for a in parsed.get("next_actions") or [] if a][:5],
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
