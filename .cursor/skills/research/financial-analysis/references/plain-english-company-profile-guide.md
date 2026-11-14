# Plain-English Company Profile Guide

Use this when the user wants a **readable company profile** for a general audience — what the company does, how it makes money, how each revenue stream has grown, what management says comes next, and challenges/opportunities — ideally with **charts** and (only if asked) a **PDF**.

Companion to:

- `SKILL.md` (India/US analysis engine, SPELL, red flags, forum sweeps)
- `india-data-pull-recipe.md` / `india-sources.md` (how to fetch filings)
- `pdf-deliverable-from-analysis.md` (fpdf2 / fonts / visual review)
- `thesis-memo-reco-template.md` (buy/hold/sell + target price — **different product**)

Worked example: **Sansera Engineering (NSE: SANSERA)** — Nov 2026 profile with stream history + management-anchored FY27 projections.

---

## 1. Pick the right deliverable

| User ask | Deliverable | This guide? |
|---|---|---|
| “Explain this company simply” / “profile for everyday readers” | Plain-English profile (+ charts; PDF if asked) | **Yes** |
| “Deep dive / thesis / red flags / SPELL” | Full skill memo under `~/research/<TICKER>/` | Skill Output Template |
| “Buy/hold/sell + target” | Thesis + reco template | `thesis-memo-reco-template.md` |
| One-liner on Telegram | Short chat reply | No file needed |

**Relay rule:** long reports → `artifacts/<topic>-report.md` **and** `/opt/cursor/artifacts/`. PDF only when the user explicitly asks.

---

## 2. Audience & writing rules

Write for a smart non-specialist (plain words, short sentences).

1. **One-sentence company definition** on page 1.
2. **Explain jargon once** (e.g. “EBITDA = operating profit before interest, tax, and machine wear-and-tear”).
3. Prefer **₹ crore** for India retail readers; state `1 crore = 10 million` once.
4. **Show, then tell** — chart first when a mix or trend is the point.
5. **No buy/sell tip** unless the user asked for a call. Always: “educational, not investment advice.”
6. Avoid wall-of-numbers pages. Tables are fine; walls of percentages without rupees are not.

---

## 3. End-to-end workflow (8 steps)

```
1 Identify company + regime (India BSE/NSE vs US SEC)
2 Pull sources → ~/research/<TICKER>/sources/
3 Extract P&L, mix, products, order book, guidance
4 Build stream history (absolute ₹) + product history
5 Build FY+1 projections ONLY from management guidance
6 Make charts (history, mix, products, FY+1 split, pipeline)
7 Draft profile sections (see outline below)
8 Deliver: JSON + charts + PDF/MD → artifacts + manifest
```

Persist everything under `~/research/<TICKER>/` with `_manifest.json` per `SKILL.md`.

---

## 4. Data you must collect

### Minimum pack (India listed) — primary docs first

Do **not** start from investor decks. Read the company's own audited and offer documents before drafting or modelling. See `india-data-pull-recipe.md` §0.

- [ ] Latest **2–3 annual reports** (read: Directors' Report, MD&A, Auditor's Report + CARO, SA + Consol notes — not just the summary P&L)
- [ ] **Offer documents** if any (IPO / SME prospectus, QIP placement document, preferential / share-swap notices, monitoring-agency reports)
- [ ] Latest **credit-rating rationale** if available
- [ ] Latest **investor presentation** (quarterly update + mix tables — after the AR/offer pass)
- [ ] Latest **earnings release**
- [ ] Latest **2–4 concall transcripts** (guidance lives here)
- [ ] Screener/Trendlyne snapshot (price, mcap, shareholding) — label the as-of date
- [ ] Order book / backlog definitions (peak annual vs lifetime backlog)
- [ ] For niche B2B names: **1–2 peer RHPs** for industry / capacity / concentration benchmarks

### Nice to have

- Prior-year presentation (for mix history continuity)
- Shareholding pattern (Reg 31)
- Light India retail sweep (ValuePickr etc.) — optional for general-audience profiles

**Source priority:** company IR / annual reports / offer docs → NSE archives → BSE → peer RHPs → Screener. Always use a browser User-Agent for NSE/BSE curls. Never copy industry or peer tables from a broker note without checking the underlying offer document.

---

## 5. Map the revenue streams

Do **not** stop at “total sales went up.”

### A. Business / end-use segments

Examples: Auto ICE · Tech-agnostic + xEV · ADS · Off-road/Agri.

For each stream, capture:

| Field | Why |
|---|---|
| Share of sales (%) over 4–6 years | Mix shift |
| Absolute ₹ (mix % × total revenue) | Rupee impact |
| Company-stated product sales if published | Cross-check (often excludes scrap/other income) |
| Stated CAGR / × growth | Management’s own framing |
| Latest quarter YoY | Near-term momentum |

### B. Product categories

Examples: connecting rods, rocker arms, crankshafts, aerospace parts.

Same table: share %, absolute ₹, trend.

### C. Geography (optional but useful)

India vs exports / regions — one pie + one trend line is enough.

### Absolute-rupee recipe

```text
stream_rupees_year = total_revenue_from_operations_year × stream_mix_%_year
```

Say in the report when you use mix-implied rupees vs “product sales” lines that exclude scrap/tooling.

---

## 6. Projections — management first (hard rule)

**Do not invent a parallel fantasy forecast.**

### Allowed FY+1 construction

1. Collect every **numeric** guide (sales band, segment band, capex, margins).
2. Collect every **directional** guide (“high-teens,” “mid-teens non-ADS”).
3. Build a **base case at the midpoint** of numeric bands.
4. Split residual streams using **recent mix** (usually latest H1 or last FY) only where management did not give a segment number.
5. Publish a **bear/base/bull** only inside the management band (or clearly mark anything outside as *illustrative / not guided*).

### Labeling rules

| Label | Meaning |
|---|---|
| **Guidance** | Exact words/numbers from management |
| **FY27E base (mgmt-anchored)** | Your split that reconciles to guided totals |
| **Ambition / vision** | Decade-end mix, aspirational revenue — not a year estimate |
| **Illustrative** | Order-book math beyond guided years |

### Always show the guidance table

| Guide | Source (call/deck/date) | Number / words |
|---|---|---|
| Company sales FY+1 | … | … |
| Segment X | … | … |
| Capex / margins / mix vision | … | … |

### Impact paragraph (required)

After the projection table, answer in plain English:

- What grows the **top line** most?
- What changes **margins / mix**?
- What stresses **cash / debt / working capital**?
- What fails if the **fast stream** misses?

---

## 7. Standard profile outline

Use this section order unless the user specifies otherwise:

1. **Cover** — one-sentence definition + snapshot table (price, mcap, FY sales/PAT, latest quarter, FY+1 guide)
2. **What it does & how it earns**
3. **Company sales, costs, profits** (short; rupee-split chart)
4. **Revenue streams — past performance** (segment history chart + table)
5. **Product categories — past performance**
6. **Projections — management-led** (guidance table + FY+1 split chart)
7. **How stream growth hits the company** (margins, cash, risk shape)
8. **Order book / pipeline** (define the metric!)
9. **Beyond FY+1** — vision only, clearly labeled
10. **Challenges & opportunities** (stream-aware)
11. **Bottom line** + sources + disclaimer

---

## 8. Chart set (minimum)

Aim for **6–10 charts**. Prefer simple bars/lines/pies over dense dashboards.

| # | Chart | Purpose |
|---|---|---|
| 1 | Sales + PAT history | Scale |
| 2 | Segment mix pie (latest quarter) | “Where money comes from now” |
| 3 | Geography pie | Optional |
| 4 | Rupee split / cost stack | Expenses |
| 5 | Margin trend | Profitability |
| 6 | **Stacked segment history (₹)** | Stream past performance |
| 7 | Segment CAGR bars | Who grew fastest |
| 8 | **Product line trends** | Product past performance |
| 9 | **FY+1 guided split vs last FY** | Projection |
| 10 | Total sales + guidance band | Anchor to mgmt |
| 11 | Order-book / backlog bars | Pipeline |
| 12 | Mix-shift area chart | Diversification story |

Color tip: avoid generic purple-gradient AI look; use a small fixed palette (e.g. navy / teal / coral / gold).

Save charts under `~/research/<TICKER>/charts/`.

---

## 9. JSON + PDF build pattern

Serialize before rendering:

```text
~/research/<TICKER>/
  _manifest.json
  sansera_data.json          # company snapshot, P&L, mix
  streams_history_projections.json
  charts/*.png
  build_pdf.py
  <Company>_Research_Report.pdf
  sources/                   # raw PDFs + extracted text
```

PDF rules (see `pdf-deliverable-from-analysis.md`):

- fpdf2 + Unicode font (DejaVu; probe multiple paths)
- `multi_cell()` for body text
- Reset `set_x(l_margin)` after cells/images
- Render pages to PNG and visually check once
- Copy final PDF to `/opt/cursor/artifacts/`

---

## 10. Quality checklist (before shipping)

- [ ] One-sentence “what they do” a stranger understands
- [ ] At least **4 years** of stream history in ₹, not only %
- [ ] Product or sub-segment history included when the company discloses it
- [ ] Every forward number traces to a **cited management source** or is labeled illustrative
- [ ] FY+1 total reconciles to guided band (± rounding)
- [ ] Order book definition stated (peak annual vs lifetime backlog)
- [ ] Costs + profits explained without assuming finance vocabulary
- [ ] Challenges include execution risk on the **fastest** stream
- [ ] Disclaimer present; no accidental buy/sell language
- [ ] PDF/pages visually reviewed (no clipped tables, empty chart pages if avoidable)
- [ ] `~/research/<TICKER>/_manifest.json` updated; artifacts copied for Relay

---

## 11. Time budget (cold run)

| Step | Approx. |
|---|---|
| Source hunt + download | 15–25 min |
| Extract mix/P&L/guidance | 20–40 min |
| Stream/product absolute tables + JSON | 15–25 min |
| Charts | 10–15 min |
| Write PDF/MD + visual review | 30–50 min |
| **Total** | **~2–3 focused hours** for a mid-cap with good IR |

Re-runs (new quarter): update JSON + 2–3 charts + rebuild PDF (~20–40 min).

---

## 12. Pitfalls (from the Sansera-style build)

1. **% without ₹** — readers cannot see which stream moves the company.
2. **Invented FY+2/+3** presented as fact — keep long-term as vision unless guided.
3. **Mixing backlog types** — ADS lifetime backlog ≠ auto “peak annual new business.”
4. **Product sales vs revenue from operations** — scrap/tooling can bridge the gap; footnote it.
5. **Crore/million/EPS unit traps** — verify with skill §5.3 gotcha #12.
6. **Guidance from secondary blogs only** — prefer transcript/deck; cite date and speaker.
7. **Chart spam** — one idea per chart; don’t put five metrics on one slide for a general audience.
8. **Skipping H1 run-rate check** — if H1 already implies the guide is easy/hard, say so.

---

## 13. Mini template (copy into the report)

```markdown
## Stream history
| Year | Stream A | Stream B | Stream C | Total |
| FY.. | ₹.. cr | ₹.. cr | ₹.. cr | ₹.. cr |

## Management guidance used
| Item | Source | Number |

## FY+1E (mgmt-anchored)
| Stream | Last FY | FY+1E | YoY | Hook to guidance |
```

---

## Related

- Full analysis engine: `../SKILL.md`
- India fetch recipe: `india-data-pull-recipe.md`
- PDF engineering: `pdf-deliverable-from-analysis.md`
- Valuation call: `thesis-memo-reco-template.md`
