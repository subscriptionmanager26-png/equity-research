# India Data-Pull Recipe (BSE/NSE → memo)

Concrete, copy-pasteable sequence for fetching an Indian listed company's filings to `~/research/<TICKER>/sources/` and producing a memo. Worked example: **<TICKER> (<Company Name>)** — 2026-07-01 run. The 5 sources fetched in this session totalled 34 MB and gave complete FY22–FY26 + FY27 guidance in one agent loop without any delegation.

## 1. Identify the canonical URLs (5–10 min)

Don't guess — start from the company IR site, which has the cleanest landing page for transcripts, presentations, and annual reports.

```
https://<company>.in/corporate-announcements/    # chronological list with document name + date
https://<company>.in/investors/                  # alternative landing
```

Search engine fallback if IR site is thin:
```
"<TICKER> FY<YY> annual report PDF"
"<TICKER> Q<NN> FY<YY> earnings call transcript"
```

For <Company> specifically:
- Annual Report FY25 → `https://mtar.in/wp-content/uploads/2025/09/Annual-Report-FY-2025-26-Aug-2025-11-Sept.pdf` (31 MB — most of it is BRSR + governance)
- Q3 FY26 transcript → `https://mtar.in/wp-content/uploads/2026/02/Final_Trans.pdf`
- Q4 FY26 transcript → `https://nsearchives.nseindia.com/corporate/MTARTECH_20052026201204_Transcript_Final.pdf` (cleaner than BSE)
- Q3 FY26 investor presentation → `https://www.bseindia.com/xml-data/corpfiling/AttachHis/70495349-...pdf`
- Shareholding Pattern (Reg 31, 31 Dec 2025) → `https://mtar.in/wp-content/uploads/2026/01/Shareholding-Pattern-31.12.2025.pdf`

## 2. Bulk-fetch with curl + UA header (1 batch, ~30s)

```bash
cd ~/research/<TICKER>/sources
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# Verify each URL with HEAD before downloading — catches 404s and non-PDF responses
curl -sLI -A "$UA" "<url>" | head -5

# Then download all in one batch
curl -sL -A "$UA" -o "annual_report_FY25.pdf"      "<annual report URL>"
curl -sL -A "$UA" -o "transcript_Q3FY26.pdf"        "<transcript URL>"
curl -sL -A "$UA" -o "investor_presentation_Q3FY26.pdf"  "<presentation URL>"
curl -sL -A "$UA" -o "shareholding_31-12-2025.pdf"  "<shareholding URL>"
```

**Critical:** without a real User-Agent, `nsearchives.nseindia.com` and `bseindia.com` silently fail (Akamai 403, exit code 92). Use a browser UA, not `curl/8.x`.

## 3. Convert to text + locate statements

You have three options. Pick based on whether you're in a Hermes session, scripting in Python, or stuck with poppler:

### 3a. Hermes-native — `pdf_doc_parse` tool (preferred)

`pdf_doc_parse` is a native Hermes tool. It routes PDFs through PyMuPDF4LLM (layout-aware) and falls back to RapidOCR for image-only pages. It returns Markdown with tables preserved, so balance-sheet line items stay in their columns.

**One-off file:**
```
pdf_doc_parse(path="/path/to/annual_report_FY25.pdf", format="markdown", ocr="auto")
```

For scoped reads, use `pages=[N]` to limit to a specific page range; `page_chunks=True` to get per-page metadata; `write_images=True` to extract embedded images.

### 3b. Python batch via `pymupdf4llm`

For scripted batch conversion that saves `.md` files into `sources/`:

```python
import pymupdf4llm
from pathlib import Path

src = Path("~/research/<TICKER>/sources").expanduser()
for pdf in src.glob("*.pdf"):
    md = pymupdf4llm.to_markdown(str(pdf))
    (src / f"{pdf.stem}.md").write_text(md)
```

Then grep for section headers (PyMuPDF4LLM preserves structure including tables as Markdown):

```bash
cd ~/research/<TICKER>/sources
grep -n "Consolidated Balance Sheet" *.md
grep -n "Consolidated statement of profit and loss" *.md
grep -n "Consolidated statement of cash flows" *.md
```

Then `read_file(path="...md", offset=N, limit=M)` to read the verbatim tables.

**⚠ Before running the script: probe which `python` actually has `pymupdf4llm` importable.** See §3d below — the right python is rarely the one you get from `shebang python3` on a Hermes host. The bundled `scripts/parse_pdf_dir.py` does this automatically.

### 3c. Legacy fallback — `pdftotext -layout`

Only on a host without PyMuPDF4LLM/MarkItDown and without the Hermes MCP toolset:

```bash
for pdf in *.pdf; do pdftotext -layout "$pdf" "${pdf%.pdf}.txt"; done
```

**Note:** this loses some table structure that PyMuPDF4LLM preserves. For heavily-indented Indian annual reports, prefer 3a/3b.

### 3d. Picking the right Python (the trap that cost two round-trips, 2026-07-01)

**`pymupdf4llm` installed ≠ `import pymupdf4llm` works.** On a Hermes-equipped host the package is usually present inside the Hermes CLI venv (`/home/pi/.hermes/hermes-agent/venv/bin/python`, uv-managed Python 3.11) — NOT the system `python3` (3.13, PEP 668, no pymupdf4llm). A naive `python3 -c "import pymupdf4llm"` in a script silently hits the system interpreter and fails. **Don't reach for `pip install --break-system-packages pymupdf4llm` when the import fails — that's the symptom of running the wrong python, not a missing package.**

The rules:

1. **Prefer `pdf_doc_parse` (§3a) for one-offs.** It's the same engine (PyMuPDF4LLM + RapidOCR + MarkItDown) and doesn't care which python your script runs in.
2. **For batch scripts on a Hermes host**, probe candidates in this order:
   - `/home/pi/.hermes/hermes-agent/venv/bin/python` (the runtime venv the `hermes` CLI uses — almost always has pymupdf4llm)
   - `/home/pi/.hermes/hermes-agent/.venv/bin/python` (AGENTS.md-preferred dev venv — sometimes lacks the package)
   - Any venv under `~/.venvs/`, `~/.virtualenvs/`, `./.venv/`, or `~/code/<project>/.venv/`
   - `python3` from `$PATH` last (system python, PEP 668 if Debian-derived)
3. **Verify before running, not by inspecting `pip list`.** On the canonical Pi layout, the venv's `pip list` shows zero packages yet `import pymupdf4llm` succeeds (suspected: installed via `uv pip install --system` or editable mode without a marker). Always probe by importing, not by inspecting the pip index:
   ```bash
   /home/pi/.hermes/hermes-agent/venv/bin/python -c "import pymupdf4llm; print(pymupdf4llm.__version__)"
   ```
   If you see a version string, set shebang or invoke explicitly with that interpreter for your script.
4. **Matplotlib has the same problem.** Not pre-installed in either Hermes venv as of 2026-07-01. If a chart-rendering script needs it, install into *whichever python your PDF script uses*, not the system python — `pip install --break-system-packages matplotlib` polluting `/usr/bin/python3` will break on the next `apt upgrade`.

Use `scripts/parse_pdf_dir.py` as the batch entry point when §3a's per-file `pdf_doc_parse` calls would be too chatty. It implements all four rules: probes candidates in order, picks the first that imports pymupdf4llm, batch-converts a directory of PDFs to `.md`.

## 4. Pull valuation context (5 min, no login)

```
https://www.tickertape.in/stocks/<ticker>-<slug>          # market cap, P/E, P/B
https://www.trendlyne.com/equity/<id>/<TICKER>/...        # shareholding history
https://stockanalysis.com/quote/nse/<TICKER>/statistics/  # TTM/forward ratios
```

Valuation snapshot for <Company> (29 Jun 2026): ₹7,620 / ₹23,400 cr mcap / TTM P/E ~240× / Fwd P/E ~109× / 52-wk range ₹1,390–8,715. Note the 52-week range — Indian mid-caps in narrative-driven rallies often have 5–6× intra-year ranges. Capture this explicitly in the memo.

## 5. Compose the memo (use the SKILL.md Output Template)

Frontmatter convention from this session:
```yaml
---
ticker: <TICKER> (NSE: <TICKER>, BSE: 543270)
as_of: 2026-07-01
fiscal_periods_covered: [FY22, FY23, FY24, FY25, FY26, Q1FY26, Q2FY26, Q3FY26, Q4FY26, 9MFY26]
regime: India (BSE/NSE)
exchange: NSE / BSE
sector: <one-liner — e.g. "Precision engineering — clean energy / nuclear / defence">
price_at_run: ₹7,620 (29 Jun 2026 close)
market_cap_at_run: ~₹23,400 cr (~$2.8B)
thesis_status: improving — operating momentum plus elevated valuation
action: hold (deep-dive context for sizing, not a buy/sell recommendation)
sources: [...]
peer_companies: [BEL, HAL, BHEL, Bharat Dynamics, Data Patterns, Paras Defence]
prev_memo: null
key_deltas_vs_prev: {}
---
```

Key memo sections that proved their value on <Company>:
1. **Snapshot table** with valuation multiples front-and-center (price, market cap, P/E TTM, P/E Fwd, 52-wk range). Indian retail-readers expect the price quote first.
2. **Three statements** (P&L → BS → CF) with multi-year history. The CFO/NI table is *the* highest-value table — make it prominent.
3. **SPELL ratios** with FY22–FY26 series, not just current year.
4. **Earnings call section** with explicit "new metrics" / "dropped metrics" / "segment emphasis shift" sub-sections. India concalls are usually less analyst-confrontational than US, so the *management disclosures* are higher-value than Q&A pushback.
5. **Order book** analysis. For project-driven India companies (capital goods, EPC, defence, infra), the order book is the leading indicator.
6. **Shareholding** snapshot — promoter % + pledge + FII/DII flow direction.
7. **Valuation context** with explicit peer multiples — Indian mid-caps often look expensive on absolute P/E because of a narrative-driven rerating; you need to compare to industry peers to make that judgment.
8. **What I'd watch** (catalysts + risks). For India, list specific program-name catalysts (e.g. "AMCA tender floats," "Calandria first order," "SLB plant commissioning Sep 2026") — these are binary events the user can track.

## 6. Write the manifest

After every successful run, write `_manifest.json` with sha256 of each saved file. See the SKILL.md schema. This is what stops you re-downloading the same 31 MB annual report next quarter.

## Pitfalls hit during the <Company> run (encoded in SKILL.md too)

- **Blank curl UA → silent 403.** Fixed by always passing a browser UA.
- **Wrong shareholding URL returns an HTML "Page Not Found" that has `.pdf` extension and silently parses as 0-byte.** Always `curl -sLI` first to confirm `Content-Type: application/pdf`. (Same trap applies to `pdf_doc_parse` — an HTML response will be mis-parsed as empty content without a warning. Validate content type before parsing.)
- **Default to `pdf_doc_parse` / `pymupdf4llm` for the heavy lifting** — both keep table column alignment intact. Only fall back to `pdftotext -layout` if neither is available, and always pass `-layout` when you do.
- **Q4 FY26 transcript on NSE archives was much cleaner than the BSE AttachHis copy** (NSE had ~443 KB, BSE had a scan-style version). Prefer NSE archives for transcripts; BSE for shareholder/board filings.
- **FY26 audited annual report not yet filed** when quarter ended 31 Mar 2026 and AGM is typically Sep — so for the most recent FY you must rely on the concall's CFO-prepared commentary + the Q4 press release. Cross-check with StockAnalysis/Tickertape for restated FY-end PAT before memoing.
- **Wrong python → silent `ModuleNotFoundError` for `pymupdf4llm`.** Even though the package is installed in the Hermes CLI venv, a script using `#!/usr/bin/env python3` on the system Python (3.13) silently fails. Don't `pip install --break-system-packages` to fix it — pick the right interpreter (see §3d). Symptom: `python -c "import pymupdf4llm"` returns `ModuleNotFoundError` but `~/.hermes/hermes-agent/venv/bin/python -c "import pymupdf4llm"` succeeds. Captured 2026-07-01 on the <TICKER> run.

## Additional lessons from the <Company> session (worth keeping in mind for the next India company)

- **The CFO / Net Income ratio is the single most important number.** <Company>'s went from -0.5× in FY22 to +2.1× in FY26 — that's the entire rerating story. Compute this across ALL years you have data for, before anything else. If CFO/NI < 0.8× sustainably → red flag. If improving rapidly → bull signal.
- **Working capital days in the Q3 investor deck are gold for momentum stocks.** Indian mid-caps with order-book visibility often run 200–280 days of NWC; a 50–100 day improvement in one quarter (<Company>: 267 → 172 days) is the single biggest signal that cash-flow quality is real.
- **Segment-mix definitional inconsistency is normal.** <Company>'s investor deck had "Clean Energy" sometimes split 2 ways (nuclear vs fuel-cell/hydel), sometimes lumped. Always pull the segment P&L table BOTH ways and reconcile — if you can't reconcile, mark the segment percentages as "directional, not precise" in the memo rather than fabricating a number.
- **The Q4 transcript usually supersedes Q1/Q2/Q3 transcripts** for the most recent FY's narrative, because it covers the full year + management's FY+1 guidance. Pull the Q4 first if you can only pull one transcript; use Q3 for the hedging-lexicon comparison.
- **Indian concalls are less analyst-confrontational than US.** The signal is therefore in management's *disclosures* (new customer names, new program-by-program quantification, plant commissioning dates, capex numbers, leverage targets) rather than in Q&A pushback. Track new metrics introduced vs dropped — see <Company> memo §3.1/§3.2 for the worked example.
- **Promoter pledge = 0 needs explicit confirmation.** Indian companies file a "no encumbrance" confirmation; don't infer from the absence of a pledge number. Trendlyne often shows "pledge X% of promoter holdings" — cross-check with the company's own Reg 31 filing before memoing.
- **52-week range matters more than P/E for narrative-driven Indian mid-caps.** <Company> had a 6× intra-year range (₹1,390 → ₹8,715). Always capture this in the snapshot table — it changes how the user thinks about entry sizing.
- **For project-driven companies (capital goods, EPC, defence, clean-energy infra), the order book is the leading indicator.** <Company>'s order book grew from ₹2,580 cr (FY26 close) to a guided ₹5,000 cr (FY27 close) — that's the bull case in one number. Always compute order-book × book-to-bill to gauge whether guidance is credible (<Company>: required inflow ₹4,000 cr in FY27 vs recent annualised run-rate ₹5,400 cr → "stretch but plausible").
- **NSE archives URL pattern is `nsearchives.nseindia.com/corporate/MTARTECH_<datetime>_<descriptor>.pdf`** — useful for direct pull once you have the accession number. The BSE analogue is `bseindia.com/xml-data/corpfiling/AttachHis/<uuid>.pdf` — usually uglier UUIDs.
- **₹ crore ≠ ₹ million. EPS conversion has a 10× unit trap.** Indian annual reports, concalls, and BSE/NSE filings report PAT, revenue, EBITDA, debt, assets in **₹ crores** (1 crore = 10 million = 100 lakhs). EPS is reported in **₹ per share**. Share count from StockAnalysis.com / Screener is in **millions**. Correct PAT → EPS conversion:
  ```python
  eps_inr = (pat_cr * 10) / shares_out_mn   # NOT pat_cr / shares_out_mn
  ```
  Forget the `* 10` and your EPS is **10× too small** (₹3.30 instead of ₹33.0). The bug is easy to miss because the FY26 sanity check passes silently — `94 / 30.76 ≈ 3.06` looks plausible until you compare against the company's reported EPS of ~₹30.5. Always cross-check the computed EPS against the company's reported EPS in the annual report's Notes to Accounts before relying on the projection model.
  - **Convention map (so future code is consistent):**
    - Revenue, EBITDA, PAT, FCF, total debt, net debt, total assets, equity → **₹ crores**
    - Share count from StockAnalysis.com → **millions** (from annual reports often in lakhs → divide by 10)
    - EPS, share price, BVPS, market cap → **rupees per share** or **₹ crores** (depending on field)
  - **Verification snippet:**
    ```python
    # Both sides should be ≈ 1.0:
    print(fy26_pat_cr * 10 / fy26_shares_mn / fy26_reported_eps)
    ```
    If it prints 10.0, 100.0, or 0.1 — unit trap. Re-check.
- **Indian mid-cap peer-group Fwd P/E is inflated by narrative rerating.** When the user asks for a buy/hold/sell call, default to the **HAL/BEL-only defensible anchor** (large-cap PSU defence ~30× Fwd P/E; mid-cap PSU defence ~43×) rather than the full peer-group median (~74×), because 4–5 of 7 typical peers are themselves in narrative-driven rerating mode (BDL 119×, PARAS 118×, etc.). The full peer median can be reported as a cross-check, not the primary anchor. See `references/thesis-memo-reco-template.md` §"Method 2 — Peer multiples" for the framework.

## Two-deck sweep for trend questions (validated 2026-07-01, <TICKER>)

When the user asks "show me the trends over the last N years" (rather than a full thesis memo on the most recent FY), the full 8-quarter sweep above is overkill. Pull just **two year-end investor presentation decks** plus one press release:

- **Year-end deck for FY(current)** — has the latest-FY-vs-prior-FY summary panel + 5 quarters of detail (Q4 prior-FY → Q4 latest-FY)
- **Year-end deck for FY(prior)** — gives 4 more quarters of history going back to Q1 FY(prior)
- **Press release for the latest quarter** — verbatim PAT / revenue headline (cross-check)

This is ~80% fewer PDFs than the full 17-quarter sweep and gives identical trend coverage. The <TICKER> 2-year run on 2026-07-01 was 2 investor decks (3MB + 2.5MB) + 1 press release = the entire revolver-mix, spend, fee, and profitability story across FY24–FY26. The investor presentation deck is the right artifact because it's what management chose to publish — it has the reconciled trend tables and the announced YoY deltas.

When to use this vs the full sweep:
- ✅ Use the two-deck sweep when the question is **trend visualisation** (charts over time) or **driver decomposition** (mix shifts, unit-economics trajectory, credit-cost cycle)
- Use the full 8-quarter sweep when the question is a **full thesis memo with buy/hold/sell action**, requires concall tone analysis, or needs Standalone vs Consolidated comparison

For credit-card issuers (<TICKER> pattern), the deck has *all* the metrics you need (P&L, asset quality, capital) for the 2-year sweep — the Annual Report adds only BRSR + governance, which is rarely the question.

For project-driven mid-caps (<Company> pattern — capital goods, EPC, defence), the deck still gives the trend but the Annual Report carries BRSR + the Related Party Transactions section that flags the governance risks.

## Credit-card-issuer data model (<TICKER> pattern)

Standard 3-statement ratio analysis (SPELL) does not apply to NBFC credit-card issuers. They file a P&L but the meaningful numbers are different. See `SKILL.md` §5.8 for the full model (transactor/revolver/EMI mix, IER / IBNEA, Yield − COF = NIM, Credit cost %, Stage 1/2/3 NPA, ECL %, CAR, borrowings mix). The `templates/credit_card_issuer_charts.py` produces the canonical 4-panel chart output (revolver mix, spends + per-card, profitability bars+lines, FY snapshot). For trend questions, the two-deck sweep above is the entire story — the headline trend data lives in those two decks.

## Time budget (this skill, <Company> specifically)

| Step | Time | Output |
|---|---|---|
| Identify URLs (web_search + IR site) | 5 min | List of 5 PDF URLs |
| Download + convert (1 batch) | 2 min | 5 PDFs + 5 `.md` files in `sources/` (via `pdf_doc_parse` × N, or `scripts/parse_pdf_dir.py` for batch) |
| Extract statements (read_file with offsets) | 10 min | Verified verbatim P&L/BS/CF tables |
| Pull valuation + shareholding context | 5 min | Market cap, P/E, promoter %, FII % |
| Write memo (Output Template) | 15 min | `memos/<date>_initial.md` |
| Write manifest | 1 min | `~/research/<TICKER>/_manifest.json` |
| **Total** | **~38 min** | Full memo + 5 verbatim sources |

For repeat runs (Q1/Q2/Q3 of next FY), this collapses to ~10 min because the manifest tells you which 1–2 files are new.