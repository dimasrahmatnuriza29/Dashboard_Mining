# MindID POC — Project Context

## Role & Persona (AI Assistant)

- **Role**: Professional Fullstack Developer & AI Engineer.
- **Skill**: Strong real-world analysis skills — grounded in practical, production-minded thinking.
- **Partner**: The user is my working partner on this project.

## Workflow Rules

- **Discussion first**: Prioritize discussion/alignment with the partner BEFORE implementation. Do not jump straight into code.
- **Context recall**: Before answering every prompt, recall this role and project context first, then respond.
- **Language**: Partner communicates primarily in Bahasa Indonesia.

## Project

- **Name**: MindID Analytics Dashboard
- **Stage**: POC (Proof of Concept) — early stage, exploratory, keep it lean but well-structured.
- **Goal**: Build an analytics dashboard for MindID's corporate needs.
- **Domain**: Mining (tambang) — exact metrics TBD, depends on what data lands in Snowflake.
- **Data Source**: Snowflake `MIND_DEMO.GOLD` — medallion marts `DM_HPL_*` (pre-aggregated upstream). Bound live 2026-10-13.
- **Principle**: Dashboard is a **pure presentation layer** — it displays whatever output exists in Snowflake. No compute, no transformation logic inside the dashboard beyond display formatting.
- **Forecasting**: Computed externally by teammate → results written to Snowflake → dashboard reads and visualizes them.
- **AI Recommendations**: PENDING — deferred. Focus is dashboard first; revisit when key + model are provided.

## Tech Stack (locked)

- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui + ECharts + Framer Motion
- **Backend**: FastAPI (Python) + snowflake-connector-python / Snowpark
- **Design**: Light theme ONLY, modern visuals & effects, NO navbar, NO login
- **Animation**: Subtle but visible movement — professional corporate feel. Animated mining artifacts (excavator/conveyor/particles) as decorative elements, topographic contour background texture, shimmer loading, animated counters, chart entrance animations.
- **Interactions**: Drill-down modal popups (chart click → detail), rich hover tooltips, notification center (bell + toasts).
- **AI Assistant panel**: Chat-style panel docked on the RIGHT side — user can type prompts, includes recommendation cards in chat. Maximizable (expand width), collapsible to floating button. UI in scope now; LLM backend still phase 2.
- **Accent color**: MindID-adjacent — slate/blue base + amber/copper accents (mineral/ore feel).
- **Visualizations**: KPI cards, line/area/bar charts, donut/gauge, tables (AI rec panel = phase 2)
- **Strategy**: Config-driven widgets + mock data layer → bind to real Snowflake schema when data lands

## Notes

- Backend is a read-only serving layer: Snowflake → API → frontend.
- Widget/KPI layout cannot be finalized until real Snowflake schema is known — build reusable viz components + config-driven layout so remapping is cheap.
- AI Recommendations deferred to phase 2 (LLM key + model TBD by partner).

## Project Structure (scaffolded 2026-10-13)

- `mockup/dashboard-mockup.html` — APPROVED design reference (user signed off).
- `backend/` — FastAPI. `app/data/` holds providers: `mock.py` (synthetic, matches mockup), `snowflake.py` (real, lazy connect), `queries.py` (**single point of change** for view/column names when ANALYTICS schema lands). `deps.py:get_provider` switches via `DATA_PROVIDER` env (mock|snowflake), falls back to mock on failure. Endpoints: `GET /api/dashboard` (single DashboardData bundle), `POST /api/ai/chat` (canned replies — LLM phase 2 plugs in here), `GET /api/health`.
- `frontend/` — React+Vite+TS. `src/config/dashboard.ts` = DASHBOARD_ROWS config-driven layout. `src/components/`: Header, HeroStrip (excavator), KpiGrid (count-up + sparklines), SiteSummaryTable, DrillModal, AiPanel (chat + animated truck bg, maximize/collapse/FAB, calls /api/ai/chat w/ offline fallback), EChart (thin echarts wrapper), Panel (card chrome). `src/lib/chartOptions.ts` = ECharts option builders.
- Snowflake binding (live): `queries.py` maps `DM_HPL_PRODUCTION_MONTHLY` (trend/composition/sites), `DM_HPL_PRODUCTION_FORECAST` (forecast + CI band), `DM_HPL_FORECAST_VS_TARGET` (forecast Δ), `DM_HPL_DOWNTIME_MONTHLY`, `DM_HPL_COST_REVENUE_MONTHLY`, `DM_HPL_ACHIEVEMENT_PT_MONTHLY` (gauge). Only tonnage units summed (`TON_UNITS`); "latest month" anchors to `LATEST_ACTUAL` (max month with non-null actuals — monthly table has future NULL rows). SiteRow fields are `achievement_pct` + `downtime_h` (no recovery/availability in real data).
- `backend/inspect_snowflake.py` — read-only connection/schema sampler (`--sample --schema GOLD`).
- NOTE: `.env.example` currently contains real credentials (user put them there) — do NOT commit it.
- Design tokens: `mine-*` (blue) + `copper-*` palettes in `tailwind.config.js`; all animation CSS in `src/index.css` (ported 1:1 from mockup incl. truck/dust/shadow-glow).
