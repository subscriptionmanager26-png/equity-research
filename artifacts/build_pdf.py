#!/usr/bin/env python3
"""Build consolidated capital-markets comparison PDF from comparison_data.json."""

from fpdf import FPDF
from pathlib import Path
import json
import os

BASE = Path(__file__).parent
DATA = json.loads((BASE / "data" / "comparison_data.json").read_text())
OUT = BASE / "capital-markets-comparison-report.pdf"

_DEJAVU_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/",
    "/usr/share/fonts/dejavu/",
    "/usr/local/share/fonts/dejavu/",
    os.path.expanduser("~/.local/share/fonts/dejavu/"),
]

def _probe_font(filename):
    for d in _DEJAVU_CANDIDATES:
        p = Path(d) / filename
        if p.is_file():
            return str(p)
    return None

def _resolve_fonts():
    required = {"": "DejaVuSans.ttf", "B": "DejaVuSans-Bold.ttf"}
    optional = {"I": "DejaVuSans-Oblique.ttf"}
    out, missing = {}, []
    for style, fn in required.items():
        p = _probe_font(fn)
        if p:
            out[style] = p
        else:
            missing.append(fn)
    if missing:
        raise FileNotFoundError(f"DejaVu fonts missing: {missing}. apt-get install fonts-dejavu")
    for style, fn in optional.items():
        p = _probe_font(fn)
        out[style] = p if p else out[""]
    return out

_FONTS = _resolve_fonts()


class ReportPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("DejaVu", "I", 7)
            self.set_text_color(120, 120, 120)
            self.cell(0, 4, "Indian Capital Markets Stocks -- Consolidated Comparison (Sep 2026)",
                       new_x="LMARGIN", new_y="NEXT", align="L")
            self.set_text_color(0, 0, 0)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(3)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "I", 6.5)
        self.set_text_color(150, 150, 150)
        self.cell(0, 4, "Not investment advice. For informational purposes only.",
                  new_x="LMARGIN", new_y="NEXT", align="L")
        self.set_text_color(0, 0, 0)

    def section_title(self, num, title):
        self.ln(4)
        self.set_font("DejaVu", "B", 13)
        self.set_text_color(30, 50, 90)
        self.cell(0, 8, f"{num}.  {title}", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def h2(self, title):
        self.ln(2)
        self.set_font("DejaVu", "B", 11)
        self.set_text_color(50, 50, 50)
        self.cell(0, 6, title, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(1)

    def body(self, text):
        self.set_font("DejaVu", "", 9.5)
        self.multi_cell(0, 5, text, align="L")
        self.ln(1)

    def bullet(self, text):
        self.set_font("DejaVu", "", 9.5)
        self.cell(6, 5, chr(8226), 0, 0)
        self.multi_cell(0, 5, text, align="L")
        self.ln(0.5)

    def callout(self, label, value, color=(180, 30, 30)):
        self.set_fill_color(*color)
        self.set_text_color(255, 255, 255)
        self.set_font("DejaVu", "B", 11)
        self.multi_cell(0, 9, f"  {label}: {value}",
                        new_x="LMARGIN", new_y="NEXT", fill=True)
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def table(self, headers, rows, col_widths=None, wrap=False):
        n = len(headers)
        if col_widths is None:
            col_widths = [190 / n] * n
        self.set_fill_color(40, 60, 100)
        self.set_text_color(255, 255, 255)
        self.set_font("DejaVu", "B", 8)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], 6, str(h), border=1,
                      new_x="RIGHT" if i < n - 1 else "LMARGIN",
                      new_y="TOP" if i < n - 1 else "NEXT", align="C", fill=True)
        self.set_text_color(0, 0, 0)
        for ri, row in enumerate(rows):
            if self.get_y() > 270:
                self.add_page()
            self.set_font("DejaVu", "", 8)
            fill = ri % 2 == 0
            if fill:
                self.set_fill_color(245, 248, 252)
            for j, val in enumerate(row):
                align = "L" if j == 0 else "R"
                txt = str(val)
                if wrap and len(txt) > 28:
                    x, y = self.get_x(), self.get_y()
                    self.multi_cell(col_widths[j], 5, txt, border=1, align=align, fill=fill)
                    self.set_xy(x + col_widths[j], y)
                else:
                    self.cell(col_widths[j], 5.5, txt[:40], border=1,
                              new_x="RIGHT" if j < n - 1 else "LMARGIN",
                              new_y="TOP" if j < n - 1 else "NEXT", align=align, fill=fill)
        self.ln(2)


def build():
    pdf = ReportPDF()
    pdf.set_auto_page_break(auto=True, margin=12)
    for style, path in _FONTS.items():
        pdf.add_font("DejaVu", style, path)
    pdf.add_page()

    # Cover
    pdf.set_font("DejaVu", "B", 20)
    pdf.set_text_color(30, 50, 90)
    pdf.cell(0, 12, "Indian Capital Markets Stocks", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("DejaVu", "B", 14)
    pdf.cell(0, 10, "BSE  |  Groww  |  Angel One  |  CDSL", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)
    pdf.set_font("DejaVu", "", 11)
    pdf.cell(0, 7, "Fundamental + Technical Analysis with Bull / Base / Bear Scenarios", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.cell(0, 7, f"As of {DATA['as_of']}  |  12-Month Horizon  |  India Regime (Consolidated)", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(6)

    pdf.callout("TOP PICK", "GROWW -- BUY (Prob-Wt PT Rs 232, +21% upside)", (0, 120, 60))
    pdf.callout("SECTOR VIEW", "Quality exchange (BSE) + growth broker (Groww) preferred over fully-priced MII (CDSL)", (40, 60, 100))

    # Summary table
    pdf.h2("Executive Summary")
    rows = []
    for s in DATA["stocks"]:
        pw = s["prob_weighted_pt"]
        up = round((pw / s["price"] - 1) * 100)
        rows.append([s["ticker"], f"Rs {s['price']:,}", f"{s['pe_ttm']}x", f"Rs {pw:,}", f"{up:+d}%", s["action"]])
    pdf.table(
        ["Stock", "Price", "P/E", "Prob-Wt PT", "Upside", "Call"],
        rows,
        col_widths=[22, 28, 18, 32, 22, 22],
    )

    # Page 2 - Fundamentals
    pdf.add_page()
    pdf.section_title(1, "Fundamental Snapshot (FY26 Consolidated)")
    fund_rows = []
    for s in DATA["stocks"]:
        fund_rows.append([
            s["ticker"],
            f"{s['fy26_revenue_cr']:,}",
            f"{s['fy26_pat_cr']:,}",
            f"{s['roe_pct']}%",
            f"{s['cfo_ni']}x",
            s["debt"][:12],
        ])
    pdf.table(
        ["Stock", "Rev (cr)", "PAT (cr)", "ROE", "CFO/NI", "Debt"],
        fund_rows,
        col_widths=[24, 28, 28, 18, 22, 70],
    )

    pdf.h2("Key Observations")
    pdf.bullet("BSE: Derivatives-driven revenue surge; ROCE 60%; near-zero debt; best earnings quality among peers.")
    pdf.bullet("Groww: #1 NSE active clients; Q1 FY27 PAT +94% YoY; EBITDA margin ~68%; premium valuation.")
    pdf.bullet("Angel One: Cheapest P/E (26x) but PAT down 22% YoY; CFO/NI -2.1x red flag from MTF expansion.")
    pdf.bullet("CDSL: Defensive MII; FY26 growth slowed to 6%; recovery thesis on demat adds + IPO pipeline.")

    # Company pages
    for idx, s in enumerate(DATA["stocks"], start=2):
        pdf.add_page()
        pdf.section_title(idx, f"{s['name']} ({s['ticker']})")
        pdf.body(s["business"])
        pdf.ln(2)
        pdf.table(
            ["Metric", "Value"],
            [
                ["Price / MCap", f"Rs {s['price']:,} / Rs {s['mcap_cr']:,} cr"],
                ["P/E TTM / P/B", f"{s['pe_ttm']}x / {s['pb']}x"],
                ["52-Week Range", f"Rs {s['52w_high']:,} - Rs {s['52w_low']:,}"],
                ["FY26 Revenue / PAT", f"Rs {s['fy26_revenue_cr']:,} / Rs {s['fy26_pat_cr']:,} cr"],
                ["TTM EPS", f"Rs {s['ttm_eps']}"],
                ["ROE / ROCE", f"{s['roe_pct']}% / {s['roce_pct']}%"],
                ["FII Holding", f"{s['fii_pct']}%"],
            ],
            col_widths=[55, 135],
        )
        pdf.h2("Technical View")
        t = s["technical"]
        pdf.bullet(f"Trend: {t['trend']}")
        pdf.bullet(f"RSI: {t['rsi']}  |  Support: {t['support']}  |  Resistance: {t['resistance']}")
        pdf.h2("12-Month Scenarios")
        sc = s["scenarios"]
        pdf.table(
            ["Scenario", "FY27E PAT", "Multiple", "PT (Rs)", "Upside", "Prob"],
            [
                ["Bear", f"{sc['bear']['fy27e_pat_cr']:,} cr", f"{sc['bear']['multiple']}x",
                 f"{sc['bear']['pt']:,}", f"{sc['bear']['upside_pct']:+d}%", f"{sc['bear']['prob']}%"],
                ["Base", f"{sc['base']['fy27e_pat_cr']:,} cr", f"{sc['base']['multiple']}x",
                 f"{sc['base']['pt']:,}", f"{sc['base']['upside_pct']:+d}%", f"{sc['base']['prob']}%"],
                ["Bull", f"{sc['bull']['fy27e_pat_cr']:,} cr", f"{sc['bull']['multiple']}x",
                 f"{sc['bull']['pt']:,}", f"{sc['bull']['upside_pct']:+d}%", f"{sc['bull']['prob']}%"],
                ["Prob-Weighted", "--", "--", f"{s['prob_weighted_pt']:,}",
                 f"{round((s['prob_weighted_pt']/s['price']-1)*100):+d}%", "100%"],
            ],
            col_widths=[28, 30, 22, 28, 24, 18],
        )
        action_color = (0, 120, 60) if s["action"] == "BUY" else (180, 130, 30)
        pdf.callout(f"ACTION: {s['action']}", f"Conviction: {s['conviction']}  |  Prob-Wt PT: Rs {s['prob_weighted_pt']:,}", action_color)

    # Comparison page
    pdf.add_page()
    pdf.section_title(6, "Cross-Stock Comparison & Rankings")
    pdf.h2("Valuation Matrix (Sep 2026)")
    pdf.table(
        ["Stock", "P/E", "P/B", "Div Yield", "Growth (PAT TTM)", "Quality (CFO/NI)"],
        [
            ["BSE", "45.5x", "19.3x", "0.32%", "+79%", "1.08x"],
            ["Groww", "48.9x", "12.4x", "0%", "+31%", "0.26x"],
            ["Angel One", "26.2x", "4.4x", "1.37%", "-5%", "-2.09x"],
            ["CDSL", "60.4x", "14.5x", "0.94%", "-5%", "1.07x"],
        ],
        col_widths=[28, 22, 22, 24, 32, 32],
    )

    pdf.h2("12-Month Rankings")
    r = DATA["ranking"]
    pdf.table(
        ["Criterion", "1st", "2nd", "3rd", "4th"],
        [
            ["Fundamental Quality", r["fundamental_quality"][0], r["fundamental_quality"][1],
             r["fundamental_quality"][2], r["fundamental_quality"][3]],
            ["Growth", r["growth"][0], r["growth"][1], r["growth"][2], r["growth"][3]],
            ["Valuation (cheap)", r["valuation_cheapness"][0], r["valuation_cheapness"][1],
             r["valuation_cheapness"][2], r["valuation_cheapness"][3]],
            ["Risk-Adj. 12m", r["risk_adjusted_12m"][0], r["risk_adjusted_12m"][1],
             r["risk_adjusted_12m"][2], r["risk_adjusted_12m"][3]],
        ],
        col_widths=[40, 30, 30, 30, 30],
    )

    pdf.h2("Bull / Base / Bear -- Side by Side")
    side = []
    for s in DATA["stocks"]:
        side.append([
            s["ticker"],
            f"Rs {s['scenarios']['bear']['pt']:,}",
            f"Rs {s['scenarios']['base']['pt']:,}",
            f"Rs {s['scenarios']['bull']['pt']:,}",
            f"Rs {s['prob_weighted_pt']:,}",
            s["action"],
        ])
    pdf.table(
        ["Stock", "Bear PT", "Base PT", "Bull PT", "Prob-Wt", "Call"],
        side,
        col_widths=[22, 28, 28, 28, 28, 22],
    )

    # Retail forum + risks
    pdf.add_page()
    pdf.section_title(7, "Retail Sentiment & Risk Factors")
    rf = DATA["retail_forum"]
    pdf.h2("ValuePickr / Retail Forum Sweep")
    pdf.bullet(f"Groww thread: {rf['groww_thread']}")
    pdf.bullet(f"Consensus: {rf['groww_consensus']}")
    pdf.bullet(f"Counter: {rf['groww_counter']}")
    pdf.bullet(f"BSE coverage: {rf['bse_coverage']}")
    pdf.bullet(f"CDSL coverage: {rf['cdsl_coverage']}")

    pdf.h2("Sector Risk Factors")
    pdf.bullet("SEBI regulatory changes on F&O (lot sizes, intraday margins, risk monitoring) -- hits BSE + brokers.")
    pdf.bullet("Market volume cyclicality -- Angel One most exposed near-term; BSE derivatives mix amplifies.")
    pdf.bullet("Competitive intensity -- Groww gaining share; Zerodha (unlisted) remains key rival.")
    pdf.bullet("Valuation compression risk -- CDSL at 60x TTM; Groww at 49x needs sustained 25%+ PAT growth.")

    pdf.h2("Catalysts (Next 4 Quarters)")
    pdf.bullet("Oct 2026: NSE monthly client statistics (Groww vs Angel One share trends)")
    pdf.bullet("Nov 2026: Q2 FY27 results season for all four names")
    pdf.bullet("Ongoing: SEBI F&O framework decisions (high beta for BSE, Groww, Angel One)")
    pdf.bullet("Q2-Q3 FY27: IPO pipeline execution (CDSL transaction + issuer fee recovery)")

    pdf.h2("Portfolio Construction")
    pdf.body(
        "Avoid overweighting both Groww and Angel One (high correlation). "
        "Balanced sleeve: Groww (growth) + CDSL (defensive MII) OR BSE alone for concentrated exchange exposure. "
        "Angel One suits value investors willing to wait for volume recovery."
    )

    pdf.ln(4)
    pdf.h2("Sources")
    for src in DATA["sources"]:
        pdf.bullet(src)

    pdf.ln(6)
    pdf.set_font("DejaVu", "I", 8)
    pdf.multi_cell(0, 4,
        "Disclaimer: This report is for informational purposes only and does not constitute investment advice. "
        "Consult a SEBI-registered investment adviser before making investment decisions. "
        "Data as of 21 September 2026 from publicly available sources.",
        align="L")

    pdf.output(str(OUT))
    print(f"PDF written: {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    build()
