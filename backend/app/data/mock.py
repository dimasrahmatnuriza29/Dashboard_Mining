from __future__ import annotations

from datetime import datetime

from app.schemas import (
    AiBlock,
    AiItem,
    BarItem,
    CompSet,
    DonutChart,
    DonutItem,
    ForecastBadge,
    InsightItem,
    KpiCard,
    MapSite,
    MarketItem,
    ProductionData,
    PtProdRow,
    PtWaste,
    RevBar,
    Story,
    TopOpp,
    TopSite,
    TrendSeries,
    UtilRing,
    WasteData,
    WasteStream,
    WasteTrend,
)


class MockProvider:
    """Synthetic data matching the approved mockup.

    Swap-in point for SnowflakeProvider — same contract, real views.
    """

    name = "mock"

    # ----------------------------------------------------------------
    # Production Intelligence page — mirrors production-intelligence mockup
    # ----------------------------------------------------------------

    def production(self, period: str | None = None, pt: str | None = None) -> ProductionData:
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        # monthly totals across the 4 PTs (Mt) — Jan–Sep actual, Oct–Dec forecast
        totals = [1.29, 1.31, 1.34, 1.36, 1.38, 1.39, 1.41, 1.43, 1.44, 1.47, 1.50, 1.53]
        actual = totals[:9] + [None, None, None]
        forecast = [None] * 8 + totals[8:]          # bridges at Sep

        return ProductionData(
            generated_at=datetime.now().isoformat(timespec="seconds"),
            source=self.name,
            periods=["Jan 2025 – Dec 2025", "Jan 2024 – Dec 2024"],
            selected_pt=pt or "",
            kpis=[
                KpiCard(id="prod", label="Total Production (Mt)", icon="truck", icon_tone="blue",
                        value=12.46, decimals=2, suffix="Mt", delta="▲ 6.8% YoY", delta_tone="green"),
                KpiCard(id="achv", label="Production Achievement", icon="target", icon_tone="blue",
                        value=92.4, decimals=1, suffix="%", delta="vs 89.2% (YTD 2024) ▲ 3.2%", delta_tone="green"),
                KpiCard(id="rev", label="Total Revenue (USD)", icon="coins", icon_tone="blue",
                        value=5.67, decimals=2, suffix="B", delta="▲ 8.9% YoY", delta_tone="green"),
                KpiCard(id="cost", label="Operational Cost (USD)", icon="wallet", icon_tone="blue",
                        value=2.18, decimals=2, suffix="B", delta="▲ 5.7% YoY", delta_tone="amber"),
                KpiCard(id="dt", label="Unplanned Downtime", icon="wrench", icon_tone="blue",
                        value=2.8, decimals=1, suffix="%", delta="▼ 28.6% YoY", delta_tone="green"),
                KpiCard(id="co2", label="CO₂ Intensity (tCO₂e/t)", icon="leaf", icon_tone="green",
                        value=0.42, decimals=2, delta="▼ 12.4% YoY", delta_tone="green"),
            ],
            trend=TrendSeries(months=months, actual=actual, forecast=forecast, target=1.42),
            forecast_badge=ForecastBadge(label="Dec 2025 Forecast", value=14.32, decimals=2,
                                         unit="Mt", delta="▲ 7.5% vs Target"),
            commodity=DonutChart(
                items=[
                    DonutItem(name="Coal", value=52.3, color="#334155"),
                    DonutItem(name="Nickel", value=18.7, color="#16a34a"),
                    DonutItem(name="Aluminium", value=15.4, color="#3b82f6"),
                    DonutItem(name="Tin", value=8.1, color="#f59e0b"),
                    DonutItem(name="Gold", value=5.5, color="#eab308"),
                ],
                center_top="12.46 Mt",
                center_bottom="Total Production",
            ),
            pt_rows=[
                PtProdRow(pt="ANTAM", pt_code="ANTAM", color="#16a34a", actual=2.82, plan=3.15, achievement_pct=88.7, delta_pct=5.4),
                PtProdRow(pt="Bukit Asam", pt_code="PTBA", color="#ef4444", actual=6.31, plan=6.70, achievement_pct=94.0, delta_pct=7.7),
                PtProdRow(pt="Timah", pt_code="TIMAH", color="#a855f7", actual=1.01, plan=1.12, achievement_pct=90.2, delta_pct=4.1),
                PtProdRow(pt="Inalum", pt_code="INALUM", color="#2563eb", actual=2.32, plan=2.45, achievement_pct=94.8, delta_pct=6.3),
            ],
            pt_total=PtProdRow(pt="Total Holding", color="#0d2d4f", actual=12.46, plan=13.42,
                               achievement_pct=92.4, delta_pct=6.8),
            ai=AiBlock(
                title="Production Opportunity",
                tag="High Impact",
                body=("Based on current trend and weather forecast, production in Dec 2025 is estimated "
                      "to be 7.5% below target. Key driver: heavy rainfall at ANTAM site 3 and equipment "
                      "availability at Bukit Asam."),
                actions=[
                    "Accelerate maintenance for critical equipment at ANTAM site 3",
                    "Optimize hauling allocation at Bukit Asam",
                    "Adjust production plan and utilize inventory buffer",
                ],
            ),
            sites=[
                MapSite(name="Bukit Asam · Tanjung Enim", pt="Bukit Asam", lon=103.80, lat=-3.75),
                MapSite(name="Bukit Asam · Lahat", pt="Bukit Asam", lon=103.55, lat=-3.80),
                MapSite(name="Bukit Asam · Muara Enim", pt="Bukit Asam", lon=104.10, lat=-3.60),
                MapSite(name="Bukit Asam · Tarahan", pt="Bukit Asam", lon=105.35, lat=-5.55),
                MapSite(name="INALUM · Kundur", pt="Inalum", lon=103.42, lat=0.83),
                MapSite(name="INALUM · Kuala Tanjung", pt="Inalum", lon=99.45, lat=3.35),
                MapSite(name="ANTAM · Pomalaa", pt="ANTAM", lon=121.62, lat=-4.18),
                MapSite(name="ANTAM · Batu Hijau", pt="ANTAM", lon=116.90, lat=-8.97),
                MapSite(name="ANTAM · UBPN Sultra", pt="ANTAM", lon=122.40, lat=-3.95),
                MapSite(name="Timah · Toboali", pt="Timah", lon=107.95, lat=-3.00),
                MapSite(name="Timah · Belitung", pt="Timah", lon=107.60, lat=-2.90),
                MapSite(name="Timah · Kundur", pt="Timah", lon=103.40, lat=0.85),
            ],
            pt_colors={"ANTAM": "#16a34a", "Bukit Asam": "#ef4444", "Timah": "#a855f7", "Inalum": "#2563eb"},
            top_sites=[
                TopSite(rank=1, site="Tanjung Enim", pt="Bukit Asam", prod=3.12, vs_plan="▲ 8.7%",
                        spark=[2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0, 3.12]),
                TopSite(rank=2, site="Batu Hijau", pt="ANTAM", prod=2.46, vs_plan="▲ 6.1%",
                        spark=[2.0, 2.05, 2.15, 2.2, 2.28, 2.35, 2.4, 2.46]),
                TopSite(rank=3, site="Kundur", pt="INALUM", prod=1.98, vs_plan="▲ 5.3%",
                        spark=[1.6, 1.68, 1.72, 1.8, 1.85, 1.9, 1.95, 1.98]),
                TopSite(rank=4, site="Toboali", pt="Timah", prod=1.23, vs_plan="▲ 3.9%",
                        spark=[1.05, 1.08, 1.1, 1.14, 1.17, 1.2, 1.22, 1.23]),
                TopSite(rank=5, site="Pomalaa", pt="ANTAM", prod=1.12, vs_plan="▲ 2.8%",
                        spark=[0.95, 0.98, 1.0, 1.04, 1.06, 1.09, 1.11, 1.12]),
            ],
            market=[
                MarketItem(name="Nickel (LME)", price="16,820", delta="▲ 2.4%", up=True),
                MarketItem(name="Coal (ICE)", price="118.5", delta="▲ 3.1%", up=True),
                MarketItem(name="Aluminium (LME)", price="2,420", delta="▼ 1.8%", up=False),
                MarketItem(name="Tin (LME)", price="31,250", delta="▲ 2.6%", up=True),
                MarketItem(name="Gold (LBMA)", price="2,380", delta="▲ 1.2%", up=True),
            ],
            key_insights=[
                InsightItem(kind="check", text="Total produksi YTD 2025 mencapai 12.46 Mt, tumbuh 6.8% YoY."),
                InsightItem(kind="check", text="ANTAM dan Bukit Asam menjadi kontributor utama produksi holding (52.3%)."),
                InsightItem(kind="warn", text="Forecast produksi Des 2025 diperkirakan 7.5% di bawah target karena faktor cuaca dan downtime."),
                InsightItem(kind="check", text="Peluang peningkatan produksi terbesar di site Tanjung Enim dan Batu Hijau."),
            ],
            next_actions=[
                "Optimalisasi jadwal maintenance alat kritikal.",
                "Percepat realisasi produksi di 5 site berkinerja tinggi.",
                "Monitor harga komoditas dan sesuaikan strategi penjualan.",
                "Evaluasi dan implementasi rekomendasi AI secara berkala.",
            ],
        )

    # ----------------------------------------------------------------
    # Zero Waste Intelligence page — mirrors waste-to-value mockup
    # ----------------------------------------------------------------

    def waste(self, period: str | None = None) -> WasteData:
        pt_colors = {"ANTAM": "#16a34a", "INALUM": "#2563eb", "TIMAH": "#f97316"}

        return WasteData(
            generated_at=datetime.now().isoformat(timespec="seconds"),
            source=self.name,
            periods=["Jan 2025 – Dec 2025", "Jan 2024 – Dec 2024"],
            kpis=[
                KpiCard(id="waste", label="Total Waste Generated", sub="(2025 YTD)", icon="recycle",
                        icon_tone="green", value=1248000, suffix="Ton", delta="▼ 32% vs. 2024",
                        delta_tone="green", spark=[95, 88, 90, 80, 76, 70, 66, 64]),
                KpiCard(id="rev", label="Total Potential Revenue", sub="(from Waste Utilization)",
                        icon="coins", icon_tone="green", value=68.7, decimals=1, prefix="USD",
                        suffix="Million", delta="▲ 45% vs. 2024", delta_tone="green",
                        spark=[30, 34, 38, 41, 47, 52, 60, 68]),
                KpiCard(id="util", label="Waste Recycled / Utilized", sub=" ", icon="leaf",
                        icon_tone="green", value=72, suffix="%", delta="▲ 18% vs. 2024",
                        delta_tone="green", spark=[54, 58, 61, 65, 68, 70, 71, 72]),
                KpiCard(id="co2", label="Estimated CO₂ Avoided", sub=" ", icon="cloud",
                        icon_tone="sky", value=245000, suffix="Ton CO₂e", delta="▲ 40% vs. 2024",
                        delta_tone="green", spark=[120, 140, 150, 170, 185, 205, 228, 245]),
                KpiCard(id="zw", label="Zero Waste Progress", icon="target", icon_tone="green",
                        value=68, suffix="%", progress=68, progress_min="Target 2030",
                        progress_max="100%"),
            ],
            trend=WasteTrend(
                quarters=["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024", "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"],
                recycled=[60, 88, 116, 120, 122, 128, 132, 136],
                landfill=[58, 62, 64, 50, 52, 58, 55, 40],
                utilization=[54, 58, 61, 65, 68, 71, 74, 77],
            ),
            util_rings=[
                UtilRing(pt="ANTAM", pct=76, yoy="+22%"),
                UtilRing(pt="INALUM", pct=71, yoy="+18%"),
                UtilRing(pt="TIMAH", pct=68, yoy="+15%"),
            ],
            sites=[
                MapSite(name="ANTAM · Kolaka", pt="ANTAM", lon=121.32, lat=-4.05, show_label=True),
                MapSite(name="ANTAM · Pomalaa", pt="ANTAM", lon=121.60, lat=-4.17, show_label=True),
                MapSite(name="ANTAM · Halmahera Timur", pt="ANTAM", lon=128.27, lat=1.10, show_label=True, size=12),
                MapSite(name="ANTAM · Bogor", pt="ANTAM", lon=106.79, lat=-6.59, show_label=True),
                MapSite(name="ANTAM · Tayan", pt="ANTAM", lon=110.00, lat=-0.10, show_label=True),
                MapSite(name="INALUM · Kuala Tanjung", pt="INALUM", lon=98.62, lat=3.37, show_label=True, size=12),
                MapSite(name="INALUM · Mempawah", pt="INALUM", lon=109.00, lat=0.40, show_label=True),
                MapSite(name="TIMAH · Pangkal Pinang", pt="TIMAH", lon=106.10, lat=-2.13, show_label=True),
                MapSite(name="TIMAH · Kundur", pt="TIMAH", lon=104.68, lat=0.80, show_label=True),
                MapSite(name="TIMAH · Belitung", pt="TIMAH", lon=107.60, lat=-2.90, show_label=True),
            ],
            pt_colors=pt_colors,
            ai_items=[
                AiItem(title="1. High-value waste opportunity detected",
                       body="– ANTAM: 12,500 ton of slag (Ni, Co) can be processed into ferronickel. "
                            "Potential revenue: <b class=\"text-navy-800\">USD 18.2M / year</b>."),
                AiItem(title="2. Utilization rate improvement",
                       body="– INALUM: Currently 68%. With improved segregation and process, availability "
                            "can reach <b class=\"text-navy-800\">80% (+12% revenue potential)</b>."),
                AiItem(title="3. Operational recommendation",
                       body="– Prioritize collaboration with external partner for "
                            "<b class=\"text-navy-800\">tin slag processing (TIMAH)</b>."),
            ],
            ai_generated_at="10:24 (30 Apr 2025)",
            comp_sets=[
                CompSet(key="holding", label="Total Holding", center="1.25 M\nTon", items=[
                    DonutItem(name="Tailings", value=42, color="#1e4d8b"),
                    DonutItem(name="Slag", value=24, color="#2e9e62"),
                    DonutItem(name="Fly Ash", value=14, color="#f97316"),
                    DonutItem(name="Scrap Metal", value=8, color="#8b5cf6"),
                    DonutItem(name="Used Oil", value=6, color="#eab308"),
                    DonutItem(name="Other", value=6, color="#cbd5e1"),
                ]),
                CompSet(key="pt", label="By PT", center="1.25 M\nTon", items=[
                    DonutItem(name="ANTAM", value=44, color=pt_colors["ANTAM"]),
                    DonutItem(name="INALUM", value=32, color=pt_colors["INALUM"]),
                    DonutItem(name="TIMAH", value=24, color=pt_colors["TIMAH"]),
                ]),
                CompSet(key="com", label="By Commodity", center="1.25 M\nTon", items=[
                    DonutItem(name="Nickel", value=38, color="#16a34a"),
                    DonutItem(name="Aluminium", value=26, color="#2563eb"),
                    DonutItem(name="Tin", value=18, color="#f97316"),
                    DonutItem(name="Bauxite", value=12, color="#8b5cf6"),
                    DonutItem(name="Other", value=6, color="#cbd5e1"),
                ]),
            ],
            rev_bars=[
                RevBar(name="Slag (FerroNickel)", pot=24.8, rea=19.6),
                RevBar(name="Tailings (Critical Minerals)", pot=18.7, rea=14.1),
                RevBar(name="Fly Ash (Cement/Construction)", pot=9.6, rea=8.1),
                RevBar(name="Scrap Metal", pot=7.3, rea=6.8),
                RevBar(name="Used Oil (Re-refining)", pot=5.1, rea=4.9),
                RevBar(name="Others", pot=3.2, rea=2.4),
            ],
            gap_pareto=[
                BarItem(name="Moisture above spec", value=654.0, color="#f59e0b"),
                BarItem(name="Lab QA incomplete", value=295.2, color="#f59e0b"),
                BarItem(name="Au grade below threshold", value=228.1, color="#f59e0b"),
                BarItem(name="Particle size too fine", value=84.3, color="#f59e0b"),
                BarItem(name="Fe2O3 below spec", value=50.3, color="#f59e0b"),
            ],
            pt_realize=[
                RevBar(name="ANTAM", pot=5.5, rea=5.1),
                RevBar(name="TIMAH", pot=2.5, rea=2.2),
                RevBar(name="INALUM", pot=2.3, rea=1.5),
            ],
            top_opps=[
                TopOpp(rank=1, opp="Slag to FerroNickel", pt="ANTAM", rev=18.2),
                TopOpp(rank=2, opp="Tailings to Rare Earth", pt="ANTAM", rev=12.6),
                TopOpp(rank=3, opp="Fly Ash to Cement", pt="INALUM", rev=9.6),
                TopOpp(rank=4, opp="Tin Slag processing", pt="TIMAH", rev=7.8),
                TopOpp(rank=5, opp="Used Oil Re-refining", pt="INALUM", rev=5.1),
            ],
            stories=[
                Story(pt="ANTAM", gradient="linear-gradient(135deg,#14532d,#166534 55%,#3f6212)",
                      title="ANTAM – Nickel Slag to Ferronickel",
                      body="Utilization of nickel slag has been commercially sold and is generating USD 12.9M revenue in 2024.",
                      status="Ongoing"),
                Story(pt="INALUM", gradient="linear-gradient(135deg,#78350f,#a16207 60%,#713f12)",
                      title="INALUM – Red Mud to Construction Material",
                      body="Pilot project in collaboration with domestic partner, targeting 50,000 ton/year by 2026.",
                      status="On Progress"),
                Story(pt="TIMAH", gradient="linear-gradient(135deg,#7c2d12,#9a3412 60%,#b45309)",
                      title="TIMAH – Tin Slag to Construction Material",
                      body="Cooperation with smelter partner to process tin slag into building blocks, targeting 15,000 ton/year.",
                      status="On Progress"),
            ],
            pt_details=[
                PtWaste(
                    pt="ANTAM", letter="A", color=pt_colors["ANTAM"],
                    waste=542000, util=76, rev=28.4,
                    streams=[
                        WasteStream(name="Slag", volume=210000, util=82, rev=18.2),
                        WasteStream(name="Tailings", volume=165000, util=71, rev=12.6),
                        WasteStream(name="Fly Ash", volume=80000, util=63, rev=6.4),
                        WasteStream(name="Others", volume=87000, util=54, rev=3.2),
                    ],
                    monthly=[38, 40, 42, 45, 44, 48, 46, 50, 52, 55, 54, 58],
                    monthly_util=[68, 70, 71, 72, 74, 73, 75, 76, 77, 78, 78, 80],
                ),
                PtWaste(
                    pt="INALUM", letter="I", color=pt_colors["INALUM"],
                    waste=398000, util=71, rev=22.5,
                    streams=[
                        WasteStream(name="Red Mud (BR)", volume=175000, util=61, rev=8.9),
                        WasteStream(name="Fly Ash", volume=90000, util=78, rev=9.6),
                        WasteStream(name="Used Oil", volume=42000, util=82, rev=5.1),
                        WasteStream(name="Others", volume=91000, util=56, rev=4.4),
                    ],
                    monthly=[30, 32, 31, 34, 35, 36, 38, 37, 39, 40, 41, 43],
                    monthly_util=[63, 64, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75],
                ),
                PtWaste(
                    pt="TIMAH", letter="T", color=pt_colors["TIMAH"],
                    waste=308000, util=68, rev=17.8,
                    streams=[
                        WasteStream(name="Tin Slag", volume=142000, util=62, rev=7.8),
                        WasteStream(name="Tailing", volume=98000, util=71, rev=5.9),
                        WasteStream(name="Overburden", volume=45000, util=55, rev=2.1),
                        WasteStream(name="Others", volume=23000, util=48, rev=2.0),
                    ],
                    monthly=[24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
                    monthly_util=[58, 60, 61, 62, 64, 65, 66, 67, 68, 69, 70, 71],
                ),
            ],
            key_insights=[
                InsightItem(kind="check", text="Total waste utilized YTD mencapai 76%, tumbuh 22% YoY."),
                InsightItem(kind="check", text="ANTAM dan INALUM menjadi kontributor utama revenue dari waste valorization."),
                InsightItem(kind="warn", text="Utilisasi red mud INALUM masih di bawah target holding."),
                InsightItem(kind="check", text="Potensi revenue terbesar dari slag dan tailings recovery."),
            ],
            next_actions=[
                "Scale up slag processing (ANTAM).",
                "Optimize material recovery from tailings (ANTAM).",
                "Accelerate red mud utilization (INALUM).",
                "Explore strategic partner for tin slag (TIMAH).",
                "Implement waste tracking system company-wide.",
            ],
        )
