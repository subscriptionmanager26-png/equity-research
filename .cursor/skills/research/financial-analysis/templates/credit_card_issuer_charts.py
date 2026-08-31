"""
NBFC Credit-Card Issuer Trend Charts — matplotlib template

Used to produce the canonical "revolver-mix / spend-fees / profitability"
3-chart panel for Indian credit-card issuers (<TICKER>-pattern).
Adjust the data blocks for the specific issuer; the chart structures
are reusable across any RBI-regulated card company (<TICKER>, HDFC Bank
Credit Card, ICICI Bank Card, Axis Bank Card, etc).

Source / canonical implementation: saved build script after the
<TICKER> 2-year trend run (2026-07-01).

USAGE
=====
1. Copy to ~/research/<TICKER>/charts/make_charts.py
2. Edit the four DATA blocks at the top to the issuer's quarterly figures
3. python3 make_charts.py
4. Vision-review each PNG with vision_analyze before delivery

REQUIREMENTS
============
- matplotlib: pip install --break-system-packages matplotlib
- DejaVu Sans (pre-installed on Debian/Raspbian)
- On this Pi (Raspbian, system Python 3.13): --break-system-packages is
  required; PEP 668 blocks system-level pip installs by default

CHART STRUCTURES (validated 2026-07-01 on <TICKER>)
==================================================
1. Stacked bar (transactor / revolver / EMI mix) — vertical, 100% stacked,
   percentages labelled inside segments in white bold
2. Dual-axis bars+line — Retail+Corporate spends bars on left axis,
   spend-per-card line on right axis
3. Bars+multi-line (profit trend) — PAT bars on left axis,
   NIM + Credit Cost + ROAA on right axis; annotation callout
4. 3-panel FY snapshot — PAT / NIM+ROAA+CC lines / EPS Basic

PITFALLS (from the <TICKER> run)
================================
- Always include a right-axis title for any twin-axis line subplot. Vision
  reviewers can mis-read line values when the secondary axis is unlabeled.
- When only some quarters have a particular metric (e.g. fees & other
  revenue is quarterly but spend-per-card has full coverage), use
  list-comprehension to filter None values rather than skipping entries —
  keeps the x-axis aligned to all 9 periods.
- Color encoding convention: PAT=blue, NIM=orange, Credit Cost=purple,
  ROAA=green, Revolver=red, Transactor=blue, EMI=green. Keep consistent
  across charts so multi-panel reads are intuitive.
- Tabular percentages inside a 100% stacked bar must be in WHITE BOLD to
  stand out against the colored fill; matplotlib default black labels
  disappear against dark blue (PAT color).
"""

import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import numpy as np
from pathlib import Path

OUT = Path(__file__).parent   # charts/
OUT.mkdir(parents=True, exist_ok=True)

# ============================================================
# DATA BLOCKS — edit for the issuer you are analysing
# ============================================================

PERIODS = ["Q4 FY24", "Q1 FY25", "Q2 FY25", "Q3 FY25", "Q4 FY25",
           "Q1 FY26", "Q2 FY26", "Q3 FY26", "Q4 FY26"]

# Receivables mix (%) — sums to 100 per quarter
mix_transactor = [39, 38, 40, 40, 41, 40, 44, 44, 46]
mix_revolver   = [37, 38, 37, 36, 35, 36, 34, 34, 32]
mix_emi        = [24, 24, 23, 24, 24, 24, 22, 23, 22]

# Spends (₹ Cr) — retail + corporate
retail_spends = [69_189, 71_880, 76_398, 80_792, 79_709,
                 82_404, 89_611, 91_962, 89_786]
corp_spends   = [10_464, 5_249, 5_495, 5_301, 8_656,
                 10_840, 17_452, 22_739, 25_564]

# Spend per card (₹ '000)
spend_per_card = [148, 151, 169, 173, 172, 177, 212, 170, 210]

# Quarterly PAT (₹ Cr) — None where not disclosed in the issuer's deck
pat = [662, None, None, 383, 534, None, 445, 557, 609]

# Key ratios (%) — quarterly where disclosed
nim = [None, None, None, 10.6, 11.2, None, 11.2, 11.0, 11.1]
cc  = [None, None, None, 9.4, 9.0, None, 9.0, 8.3, 7.7]
roaa = [None, None, None, 2.4, 3.4, None, 2.6, 3.2, 3.6]

# FY-level summary
fy = ["FY24", "FY25", "FY26"]
fy_pat   = [2_408, 1_916, 2_167]
fy_nim   = [11.1, 10.8, 11.2]
fy_cc    = [7.1, 9.0, 8.6]
fy_roaa  = [4.6, 3.1, 3.2]
fy_eps   = [25.39, 20.15, 22.77]

# ============================================================
# AESTHETICS — keep colors consistent across charts
# ============================================================
plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "axes.titlesize": 12,
    "axes.titleweight": "bold",
    "axes.labelsize": 10,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.alpha": 0.25,
    "grid.linestyle": "--",
    "figure.dpi": 130,
})

C_TXN  = "#1f77b4"   # blue   - transactor
C_REV  = "#d62728"   # red    - revolver
C_EMI  = "#2ca02c"   # green  - EMI converters
C_PAT  = "#0d6efd"
C_NIM  = "#ff7f0e"
C_CC   = "#9467bd"
C_FEE  = "#17becf"


# ============================================================
# CHART 1 — Revolving credit behaviour
# ============================================================
fig, ax = plt.subplots(figsize=(10, 5.2))
x = np.arange(len(PERIODS))
w = 0.62

ax.bar(x, mix_transactor, w, label="Transactor (pays in full)", color=C_TXN)
ax.bar(x, mix_revolver, w, bottom=mix_transactor,
       label="Revolver (carries balance)", color=C_REV)
ax.bar(x, mix_emi, w, bottom=np.array(mix_transactor)+np.array(mix_revolver),
       label="EMI (converts)", color=C_EMI)

# White-bold percentage labels inside each segment
for i in range(len(PERIODS)):
    ax.text(i, mix_transactor[i]/2, f"{mix_transactor[i]}%",
            ha="center", va="center", color="white", fontsize=9, fontweight="bold")
    ax.text(i, mix_transactor[i] + mix_revolver[i]/2, f"{mix_revolver[i]}%",
            ha="center", va="center", color="white", fontsize=9, fontweight="bold")
    ax.text(i, mix_transactor[i] + mix_revolver[i] + mix_emi[i]/2, f"{mix_emi[i]}%",
            ha="center", va="center", color="white", fontsize=9, fontweight="bold")

ax.set_title("Receivables Mix — Transactor / Revolver / EMI (%)",
             loc="left", pad=12)
ax.set_xticks(x)
ax.set_xticklabels(PERIODS, rotation=30, ha="right")
ax.set_ylabel("Share of Receivables (%)")
ax.set_ylim(0, 110)
ax.legend(loc="lower right", frameon=False, ncol=3)
ax.set_axisbelow(True)

plt.tight_layout()
plt.savefig(OUT / "01_revolver_mix.png", bbox_inches="tight")
plt.close()


# ============================================================
# CHART 2 — Card-usage & fees (dual-axis bars + line)
# ============================================================
fig, ax1 = plt.subplots(figsize=(10, 5.4))
x = np.arange(len(PERIODS))

ax1.bar(x - 0.18, np.array(retail_spends) / 1000, 0.35,
        label="Retail Spends (₹'000 Cr)", color="#0d6efd", alpha=0.85)
ax1.bar(x + 0.18, np.array(corp_spends) / 1000, 0.35,
        label="Corporate Spends (₹'000 Cr)", color="#fd7e14", alpha=0.85)

ax1.set_ylabel("Total Spends (₹ '000 Cr)", color="#0d6efd")
ax1.tick_params(axis="y", labelcolor="#0d6efd")
ax1.set_xticks(x)
ax1.set_xticklabels(PERIODS, rotation=30, ha="right")

ax2 = ax1.twinx()
ax2.spines["top"].set_visible(False)
ax2.grid(False)

valid_x = [i for i, v in enumerate(spend_per_card) if v is not None]
valid_v = [v for v in spend_per_card if v is not None]
ax2.plot(valid_x, valid_v, "D-", color=C_FEE,
         label="Spend per Card (₹ '000)", linewidth=2, markersize=5)
ax2.set_ylabel("Spend per Card (₹ '000)", color=C_FEE)
ax2.tick_params(axis="y", labelcolor=C_FEE)

h1, l1 = ax1.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax1.legend(h1 + h2, l1 + l2, loc="upper left", frameon=False, ncol=3, fontsize=9)

ax1.set_title("Card-Usage & Spends", loc="left", pad=12)
ax1.set_axisbelow(True)

plt.tight_layout()
plt.savefig(OUT / "02_spends_and_fees.png", bbox_inches="tight")
plt.close()


# ============================================================
# CHART 3 — Profitability: PAT bars + NIM/CC/ROAA lines
# ============================================================
fig, ax1 = plt.subplots(figsize=(10, 5.4))
x = np.arange(len(PERIODS))

pat_x = [i for i, v in enumerate(pat) if v is not None]
pat_v = [v for v in pat if v is not None]
bars = ax1.bar(pat_x, pat_v, 0.55, color=C_PAT, alpha=0.9, label="PAT (₹ Cr)")
for b, v in zip(bars, pat_v):
    ax1.text(b.get_x() + b.get_width()/2, v + 8, f"₹{v:,}",
             ha="center", va="bottom", fontsize=9,
             color=C_PAT, fontweight="bold")

ax1.set_ylabel("PAT (₹ Cr)", color=C_PAT)
ax1.tick_params(axis="y", labelcolor=C_PAT)
ax1.set_xticks(x)
ax1.set_xticklabels(PERIODS, rotation=30, ha="right")
ax1.set_ylim(0, 800)

ax2 = ax1.twinx()
ax2.spines["top"].set_visible(False)
ax2.grid(False)

def _plot(metric, color, marker, label):
    mx = [i for i, v in enumerate(metric) if v is not None]
    mv = [v for v in metric if v is not None]
    ax2.plot(mx, mv, f"{marker}-", color=color, label=label,
             linewidth=2, markersize=6)

_plot(nim,  C_NIM, "o", "NIM (%)")
_plot(cc,   C_CC,  "s", "Credit Cost (%)")
_plot(roaa, "#2ca02c", "^", "ROAA (%)")

ax2.set_ylabel("Yield / NIM / Cost / ROAA (%)")
ax2.set_ylim(2, 14)

h1, l1 = ax1.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax1.legend(h1 + h2, l1 + l2, loc="upper left", frameon=False, ncol=4, fontsize=9)

ax1.set_title("Profitability Trends", loc="left", pad=12)
ax1.set_axisbelow(True)

plt.tight_layout()
plt.savefig(OUT / "03_profit_trends.png", bbox_inches="tight")
plt.close()


# ============================================================
# CHART 4 — FY-level snapshot (3-panel)
# ============================================================
fig, axes = plt.subplots(1, 3, figsize=(12.5, 4.3))
colors = ["#4575b5", "#fee090", "#d73027"]

ax = axes[0]
bars = ax.bar(fy, fy_pat, color=colors, alpha=0.9)
for b, v in zip(bars, fy_pat):
    ax.text(b.get_x() + b.get_width()/2, v + 50, f"₹{v:,}",
            ha="center", fontsize=10, fontweight="bold")
ax.set_title("PAT (₹ Cr)", loc="left", fontweight="bold")
ax.set_ylim(0, 2900)
ax.set_axisbelow(True)

ax = axes[1]
ax.plot(fy, fy_nim,  "o-", color=C_NIM,    label="NIM %",       linewidth=2.2, markersize=8)
ax.plot(fy, fy_roaa, "^-", color="#2ca02c", label="ROAA %",      linewidth=2.2, markersize=8)
ax.plot(fy, fy_cc,   "s-", color=C_CC,     label="Credit Cost %", linewidth=2.2, markersize=8)
ax.set_title("NIM / ROAA / Credit Cost (%)", loc="left", fontweight="bold")
ax.set_ylim(0, 14)
ax.legend(loc="lower left", frameon=False, fontsize=9)
ax.set_axisbelow(True)

ax = axes[2]
bars = ax.bar(fy, fy_eps, color=colors, alpha=0.9)
for b, v in zip(bars, fy_eps):
    ax.text(b.get_x() + b.get_width()/2, v + 0.6, f"₹{v:.2f}",
            ha="center", fontsize=10, fontweight="bold")
ax.set_title("EPS Basic (₹)", loc="left", fontweight="bold")
ax.set_ylim(0, 32)
ax.set_axisbelow(True)

plt.suptitle("FY24 / FY25 / FY26 Snapshot", fontsize=13, fontweight="bold",
             x=0.05, ha="left", y=1.04)
plt.tight_layout()
plt.savefig(OUT / "04_fy_snapshot.png", bbox_inches="tight")
plt.close()

print("✓ Generated:")
for p in sorted(OUT.glob("*.png")):
    print(f"  {p.name}  ({p.stat().st_size/1024:.0f} KB)")
