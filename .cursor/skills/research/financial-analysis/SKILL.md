---
name: financial-analysis
description: "Use when analyzing a company's financial statements (10-K/10-Q/annual report) or earnings conference calls (quarterly CEO/CFO call). Covers the three core statements, key ratios across five categories (SPELL: solvency/profitability/efficiency/liquidity/leverage), DuPont decomposition, earnings-call structure, prepared remarks vs Q&A, management tone/hedging language, guidance classification, and 7 classic red flags. Also covers the parallel India regime (BSE/NSE/MCA filings, SEBI LODR, FY Apr–Mar, standalone vs consolidated, BRSR), the multi-venue India retail-forum sweep for NSE/BSE-listed names (Part 5.9 — ValuePickr, Capitalmind, Trendlyne, Tickertape, Screener, Reddit India, India Substacks, SEBI RIAs), the multi-venue US retail-forum sweep for NYSE/Nasdaq names (Part 7 — Seeking Alpha, Substack, Reddit r/ValueInvesting + r/SecurityAnalysis + r/stocks + r/wallstreetbets, Sumzero, Motley Fool Premium, StockTwits, Yahoo Finance, X/Twitter), and an expanded earnings-call transcript source map covering 14 US + 12 India venues plus audio fallback. Persists every analysis to ~/research/ with a cache manifest so future analyses only refetch new filings. Trigger on 'analyze this company's financials', 'read the 10-K', 'interpret the earnings call', 'spot red flags in the report', 'what does the conference call tell us', 'check ValuePickr on <Indian name>', 'sweep Seeking Alpha on <US ticker>'."
version: 1.11.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [finance, investing, fundamental-analysis, earnings, research]
    related_skills: [consumer-official-source-research, arxiv]
    changelog:
      - '1.11.0: Three structural improvements. (1) PDF font loader in templates/build_pdf.py + references/pdf-deliverable-from-analysis.md now does defensive probing of 11 common DejaVu install paths (Debian/Ubuntu/RHEL/macOS/Homebrew/Snap/user-installed) instead of hardcoding /usr/share/fonts/truetype/dejavu/, with a loud FileNotFoundError listing fix instructions if none resolve. (2) Step 6 earnings-call transcript section expanded from 4 sources to 14 US-priority + 12 India-priority sources including EarningsCall.biz, Zacks, Investing.com, AlphaStreet, Sentieo, Trendlyne, Tickertape, plus audio fallback (YouTube + whisper). (3) Part 7 US retail forum sweep expanded from 5 venues to 17 across 4 tiers (Tier 1: SA+Substack+r/ValueInvesting; Tier 2: r/stocks+r/investing+r/SecurityAnalysis+r/wallstreetbets+Sumzero+Fool Premium; Tier 3: StockTwits+Yahoo+GuruFocus+TIKR+Investing.com+company-specific subs; Tier 4: X/Twitter+Discord). Part 5.9 India ValuePickr sweep expanded from 1 venue to 15 across 4 tiers (Tier 1: ValuePickr+Capitalmind+Trendlyne+Tickertape; Tier 2: Screener+r/IndiaInvestments+r/IndianStockMarket+r/Dhan+India Substacks+SEBI-RIAs; Tier 3: MoneyControl+StockTwits+India Twitter; Tier 4: Telegram+WhatsApp). Added 7 pitfalls each for Part 7 + Part 5.9 covering the new venues. Updated description and trigger list.'
      - '1.10.0: Added Part 7 — US Retail Investor Forum Sweep (Seeking Alpha + Substack + r/ValueInvesting). Parallel to Part 5.9 (ValuePickr for India). Same 5-bullet output format with venue-specific sources. Updated one-page memo template to include both retail-forum sections. Updated description and trigger list.'
      - '1.9.0: prior release.'   
---

# Financial Analysis (Statements + Earnings Calls)

A condensed workflow for analyzing public companies through their filings and quarterly conference calls. Built from primary investor-education sources (SEC, HBS, Wall Street Prep, PwC) and practitioner frameworks (Minalyst 2026, StockAlpha, Calypso, Investopedia, Harvard/Zeckhauser managerial-style research).

The headline insight: **numbers tell you what happened; the call tells you whether to trust what's next.** Use them together.

## Regime Selection (US vs India)

This skill covers two parallel regulatory regimes. Pick the right path before pulling documents — the filing names, deadlines, and gotchas differ.

| | **US regime** (Parts 1–4 below) | **India regime** (Part 5) |
|---|---|---|
| Primary regulator | SEC | SEBI (LODR Regulations 2015) |
| Annual filing | **10-K** | **Annual Report** (filed with BSE/NSE + MCA AOC-4) |
| Quarterly filing | **10-Q** (3 per FY) | **Quarterly Financial Results** filed with BSE/NSE under Reg. 33 (3 per FY) |
| Material event | **8-K** | Outcome of Board Meeting + corporate announcements |
| Proxy | **DEF 14A** | Postal Ballot / AGM Notice + Corporate Governance section in Annual Report |
| ESG | Sustainability disclosures in 10-K | **BRSR** (Business Responsibility & Sustainability Report) — mandatory for top 1000 listed by mkt cap from FY23 |
| Structured data | EDGAR XBRL (`/api/xbrl/companyfacts/CIK{cik}.json`) | MCA XBRL bulk data; CMIE Prowess (paid); BSE/NSE filings pages |
| Filing deadlines | 10-K: 60d; 10-Q: 40d | Annual: 60d; Quarterly: 45d from quarter end |
| Fiscal year | Calendar (Jan–Dec) typical | **FY = Apr–Mar**. FY25 = Apr 2024 – Mar 2025 |
| Consolidation | Single consolidated set | **Two parallel sets** — Standalone + Consolidated. Always use Consolidated for investment analysis |
| Concall transcripts | Seeking Alpha, Motley Fool, AlphaSense | Company IR site (often with YouTube audio); Trendlyne / Tickertape; paid AlphaSense/Refinitiv |

**How to pick:** if the company files with the SEC, use Parts 1–4 as written. If it's listed on BSE/NSE (or BSE/NSE was the listing venue at IPO), jump to **Part 5** for the India source map and adaptations, but Parts 1–4 (statements, SPELL, earnings call, red flags) still apply with minor adjustments — call out the deltas inline.

## When to Use

- Reading a 10-K, 10-Q, or annual report and want to know which numbers actually matter.
- Analyzing an earnings press release + call transcript (own portfolio, comp set, due diligence).
- Comparing two companies on financial health before a decision.
- Stress-testing a thesis: "the guidance looks weak but the numbers beat — should I worry?"
- Spotting red flags before they show up in price action.

**Don't use for:** pure technical/price-action analysis (no fundamentals in scope), crypto/NFT valuation, or macro forecasting — those need different frameworks.

## Default Time Scope

Use this scope unless the user specifies otherwise:

- **8 quarters of operating data** (last 2 years, including the most recent) — actually delivered as **6 10-Qs** (Q1/Q2/Q3 of each year; 10-Qs are not filed for Q4) + **2 10-Ks** that contain the Q4 figures. Covers the skill's red-flag thresholds (2–3 consecutive quarters) and gives enough data for the CFO/Net Income ratio trend.
- **Last 2 annual 10-Ks** — capital structure, segment mix, one-time items, and accounting policy changes that don't surface quarterly.
- **Latest earnings call transcript** plus prior 3 for hedging-lexicon scoring and tone-shift detection.

**Rationale:** 8 quarters is the minimum to distinguish trend from noise (most red flags need 2–3 consecutive quarters to fire; CFO/NI ratio wants 4–8 quarters of history). Last 2 annuals captures structural changes that don't appear in 10-Qs. Prior 3 calls is what the skill's hedging-lexicon scoring requires.

**Why not more:** 3–5 year sweeps add data without much additional signal once you have 8 quarters + 2 annuals — most red flags and trend shifts surface inside this window. Expand to 3+ years only when stress-testing a long-duration thesis, analyzing a cyclical (industrials/semis/materials), or investigating accounting-policy shifts.

**Why not less:** Single-quarter analysis can't distinguish a real trend from noise. Single annual misses the quarterly cadence where most manipulation and inflection points appear.

## Data-Gathering Checklist (Default Scope)

Hand this to a research subagent when running the default 2-year scope. Total: **14 documents** per company.

**Filings (8 total — covers 8 quarters)**
- [ ] 10-K — most recent fiscal year (contains Q4 figures)
- [ ] 10-K — prior fiscal year
- [ ] 10-Q — current year Q3
- [ ] 10-Q — current year Q2
- [ ] 10-Q — current year Q1
- [ ] 10-Q — prior year Q3
- [ ] 10-Q — prior year Q2
- [ ] 10-Q — prior year Q1

**Earnings call transcripts (4 total)**
- [ ] Latest quarter call (Q&A + prepared remarks)
- [ ] Prior quarter call
- [ ] Same quarter prior year (YoY tone baseline)
- [ ] One mid-range call (~3 quarters back) to fill the hedging-lexicon window

**Companion documents (optional but recommended)**
- [ ] Latest earnings press release (8-K)
- [ ] Latest investor presentation / shareholder letter (CEO framing)
- [ ] Most recent proxy statement (DEF 14A) — only if exec comp or governance is in scope

## Sources, in priority order
1. **SEC EDGAR** (sec.gov/edgar) — primary; free; XBRL available for 10-K/10-Q structured extraction
2. **Company IR site** — sometimes has cleaner PDF formatting than EDGAR's HTML; press releases usually available earlier
3. **Earnings call transcripts** — Seeking Alpha, Motley Fool, AlphaSense (paid), or company IR (audio + transcript pair)

**Structured-data shortcut:** If pulling all 8 filings, use the SEC EDGAR Financial Statements API or XBRL frames (`/api/xbrl/companyfacts/CIK{cik}.json`) to dump P&L + BS + CF line items directly into a spreadsheet. Faster than reading 8 PDFs.

## EDGAR Data-Extraction Playbook (How to Actually Pull the Numbers)

The skill above tells you *what* numbers to look for. This section is *how* to get them efficiently. The full 14-document default scope is impossible inside one delegation (600s timeout burns repeatedly) — use the right tool for each phase.

### Step 1: Get the CIK (don't guess)

CIKs are NOT obvious from tickers. The wrong CIK silently returns a different company. Always verify:

```bash
# Option A: search by ticker — fastest
curl -s -H "User-Agent: <your name> <email>" \
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<TICKER>&type=10-K&dateb=&owner=include&count=40" \
  | grep -oE "CIK=[0-9]+" | sort -u
# Returns the correct CIK. Always check the leading zeros — <TICKER> is 0001618732, not 1618732.

# Option B: tickers JSON lookup
curl -s -H "User-Agent: <your name> <email>" \
  "https://www.sec.gov/files/company_tickers.json"
```

URL format for all subsequent EDGAR calls: `CIK` is always **10 digits with leading zeros** in URLs. `https://data.sec.gov/submissions/CIK0001618732.json`.

**SEC rate-limits anonymous curl at 10 req/sec.** Set a `User-Agent` header (any non-blank string is fine) or you'll get 403s. Prefer running batches in foreground `mcp_lean_ctx_shell` calls rather than spawning parallel HTTP.

### Step 2: Filings list (do this before pulling documents)

```bash
curl -s -H "User-Agent: <user>" "https://data.sec.gov/submissions/CIK0001618732.json" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); r=d['filings']['recent']; [print(f'{r[\"filingDate\"][i]} | {r[\"form\"][i]} | period={r[\"reportDate\"][i]} | accession={r[\"accessionNumber\"][i]} | primary={r[\"primaryDocument\"][i]}') for i in range(len(r['form'])) if r['form'][i] in ('10-K','10-Q','8-K','DEF 14A')]"
```

Use the accession number to build the filings index: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K&dateb=&owner=include&count=40`

### Step 3: Pull structured data — XBRL companyfacts (fastest, but watch for missing concepts)

```bash
# One call, all line items, all periods. ~5-15MB JSON for big filers.
curl -s -H "User-Agent: <user>" "https://data.sec.gov/api/xbrl/companyfacts/CIK0001618732.json" -o /tmp/cik_xbrl.json

# Navigate: data['facts']['us-gaap']['<Concept>']['units']['USD' | 'USD/shares']
```

**Pitfalls (these cost real time on first encounter):**

- **Concept names are not standardized.** The standard US-GAAP tag is `Revenues`, but many filers tag their top-line as `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet` + `SalesRevenueServicesNet` + `SalesRevenueGoodsNet` (sum required — e.g., <Company>), or even domain-specific tags. Always grep the XBRL keys for what you want rather than hardcoding.
- **Annual vs interim concepts are mixed.** The same concept can appear with `fp=FY` (full year, from 10-K) AND with quarterly `start/end` spans. Filter by `form` AND `fp` to disambiguate. Prefer the 10-K figures for annual — they supersede any 10-Q YTD.
- **For quarterly P&L, take the 3-month row** (start to end ≈ 89-93 days). The 10-Q reports BOTH the quarter and the YTD, both tagged with `form=10-Q`. You want only the 3-month rows; the YTD rows are duplicates that will throw off deltas.
- **Restated/duplicate values.** A concept can appear multiple times for the same period (restatements, different filings). Pick the value with the latest `filed` date.
- **Some concepts are simply missing** (e.g., `LongTermDebt`, `InventoryNet` for software companies). Don't assume presence.

**When to use XBRL vs HTML extraction (the decision rule):**

| Use case | Use XBRL | Use HTML | Why |
|---|---|---|---|
| Single filing, want one or two specific numbers | ✅ Fast | Slower (must parse full doc) | One curl + grep is faster than web_extract on a 5MB HTML |
| Multi-quarter trend (8 quarters × N line items) | ✅ Fast | Too slow | XBRL dumps 8 quarters in one call; HTML needs 8 fetches |
| Concept name known to be standardized (Revenues, NetIncomeLoss, CFO, CapEx, Cash) | ✅ Reliable | Reliable | Standard tags work across 90% of US filers |
| Concept is company-specific (<Company>'s `SalesRevenueServicesNet` + `SalesRevenueGoodsNet` sum) | ❌ Easy to miss | ✅ Reliable | HTML table has the labeled total; XBRL has the components |
| First time pulling this ticker | ✅ Try first, fall back | Always works as fallback | XBRL is the fast path; HTML is the safety net |
| 10-K/10-Q HTML > 5MB | ❌ Times out on web_extract | Use XBRL R-files (R2/R3/R7) | See Step 4 |
| Want management narrative (MD&A, risk factors, segment commentary) | ❌ Not in XBRL | ✅ Required | XBRL tags only the structured numbers, not prose |

**Default rule of thumb: try XBRL for standardized line items first. Fall back to HTML extraction for anything company-specific or anything involving narrative.** Don't trust XBRL to give you a complete P&L on first contact — verify the concepts by grepping the JSON keys before relying on the numbers.

**For subagent work, prefer HTML extraction.** Subagents can't reliably handle 8MB of XBRL JSON within their iteration budget (see Step 8). The 10-K HTML via R-files (Step 4) is the right tool when a subagent is doing the work.

### Step 4: When the 10-K HTML is too large — use XBRL R-files

The 10-K and 10-Q HTMLs from EDGAR are often 3-10MB and time out on `web_extract`. Workaround:

Each 10-K/10-Q has a small set of XBRL R-files attached to the accession number, each rendering one statement/section as a small HTML file:
- `R2.htm` — Balance Sheet
- `R3.htm` — usually Income Statement
- `R4.htm` — sometimes Income Statement, sometimes Notes
- `R7.htm` — usually Cash Flow Statement
- `R{17-25}.htm` — Notes to financial statements

The accession-number directory is: `https://www.sec.gov/Archives/edgar/data/{cik_no_zeros}/{accession_no_dashes}/`. Iterate `R*.htm` to find the right ones — 5-300KB each, they parse cleanly via `mcp_lean_ctx_ctx_url_read` (markdown mode works great) or `web_extract`.

**Caveat:** R-files contain only what was in the XBRL tagged data. Narrative MD&A content (risk factors, segment narrative, forward guidance commentary) is in the primary document, not the R-files. For MD&A, fall back to the press release on the company IR site.

### Step 5: ARR, RPO, and forward guidance live in MD&A / press releases, not XBRL

XBRL does NOT tag:
- Annual Recurring Revenue (ARR) / Remaining Performance Obligations (RPO)
- Forward guidance
- Average contract duration
- Net dollar retention (NRR) / net dollar-based retention

These live in the MD&A section of the 10-Q/10-K, and more cleanly in the **earnings press release** on the company IR site (e.g., `ir.nutanix.com/news-releases`). Always pull the press release from the IR site — it's structured, machine-readable, and usually available before EDGAR indexes the 10-Q.

### Step 6: Earnings call transcript

The transcript is the hardest document to retrieve. Try **all of the free/public sources first**, then the paid/fallback ones. The order below is the most reliable → least reliable path observed across 2026 runs (<TICKER>, <TICKER>, <TICKER>, <TICKER>, <TICKER>, and the India mid-cap sweep).

#### US regime — priority order

1. **Motley Fool** — `https://www.fool.com/earnings/call-transcripts/YYYY/MM/DD/<company>-<ticker>-q<N>-<YYYY>-earnings-call-transcript.aspx` — usually free, most reliable for S&P 500 / Nasdaq-100 names. Has gaps for smaller caps.
2. **Company IR site** — official FactSet "Corrected Transcript" PDF, often at `ir.<company>.com/static-files/<uuid>`. Most authoritative; carries the company's preferred wording. Look for an "Events & Presentations" or "Quarterly Results" subsection.
3. **Seeking Alpha** — gated, often behind login. Free articles surface the prepared remarks; the full Q&A is paywalled. Use for the bull/bear thesis framing in Part 7, not for verbatim transcript content.
4. **EarningsCall.biz** — `https://earningscall.biz/` — free, indexes the same Motley Fool/Refinitiv transcripts but has a more reliable full-text URL pattern: `https://earningscall.biz/<ticker>-q<N>-<YYYY>-earnings-call-transcript/`. Works as a backup when Motley Fool returns a 404 or has a gap.
5. **Zacks Investment Research transcripts** — `https://www.zacks.com/stock/research/<TICKER>/earnings-transcripts` — free tier covers most Nasdaq / NYSE names; quality is comparable to Motley Fool.
6. **Investing.com earnings call transcript** — `https://www.investing.com/news/transcripts/<ticker>` — free, smaller catalog but covers major US names. Useful backup.
7. **AlphaStreet** — `https://alphastreet.com/earnings/<ticker>-q<n>-<yyyy>/` — global coverage including US, India, and other markets. Free tier covers the latest 4-8 quarters; older quarters may be gated.
8. **Sentieo (S&P Capital IQ)** — paid; high-quality institutional transcripts with multiple speakers tagged correctly and clean punctuation. Default fallback when free sources return summaries instead of full text.
9. **AlphaSense** — paid; the institutional standard. Coverage is exhaustive for US large-caps but quality varies for smaller names.
10. **Refinitiv / Lipper transcripts** — paid; legacy vendor still used by some banks for archived content. Use only as a last resort.
11. **CCTranscripts.com / Wall Street Horizon** — niche paid vendors covering specific sectors (financials, healthcare). Worth checking for bank/healthcare tickers.
12. **Bamsec.com** — paid; has good historical coverage and a clean URL structure.
13. **archive.org Wayback Machine** — for any URL that's gone paywalled. `https://web.archive.org/web/*/<original-transcript-url>` often has a snapshot.
14. **StockAnalysis.com / MarketScreener / GuruFocus** — these aggregator sites sometimes host full transcripts under their "earnings" or "research" tabs. Quality varies; treat as last-resort free sources.

#### India regime — priority order

1. **NSE archives** — `https://nsearchives.nseindia.com/corporate/<TICKER>_<date>_<time>_Transcript*.pdf` — cleanest PDF rendering, posted 5-10 days after the call. **First stop** for any NSE-listed name. Verify file size > 50 KB (smaller = cover letter only, see Pitfall #14).
2. **Company IR site** — `e.g. mtar.in/wp-content/uploads/<YYYY>/MM/...` — official copy, may have minor redactions but always available. Look for "Investors → Earnings Call" or "Concall Transcripts" sections.
3. **BSE corporate announcements** — `https://www.bseindia.com/xml-data/corpfiling/AttachHis/<pdf-id>.PDF` — same filing as NSE archives, but BSE PDF is sometimes more compressed and IR-style edits are more aggressive.
4. **AlphaStreet India** — `https://alphastreet.com/india/earnings/<company>/` — strong India coverage. Free tier covers most recent quarters; older transcripts may require registration.
5. **Trendlyne transcripts** — `https://trendlyne.com/equity/<...>/<TICKER>/concall-transcripts/` — has a free transcript archive for most large/mid-cap names, with the AI-cleaned-up format. Useful when NSE archive is stale.
6. **Tickertape transcripts** — `https://www.tickertape.in/stocks/<ticker>/concall-transcripts` — limited but covers most Nifty 50 + Nifty Next 50 names. Clean formatting.
7. **Screener.in concall section** — `https://www.screener.in/<company>/concall/` — has quarterly results + transcript summaries (often user-submitted, quality varies).
8. **MoneyControl transcripts** — `https://www.moneycontrol.com/stocks/<...>/<company>/concall-transcript.html` — broad coverage including SME. Quality varies; sometimes the transcript is truncated to prepared remarks only.
9. **Trendlyne / Tickertape / StockEdge concall YouTube playlists** — many companies post the audio to YouTube. Use the auto-generated captions + a manual cleanup pass. Last-resort free source.
10. **BloombergQuint / NDTV Profit / ET Now transcripts** — financial-news transcripts of major India earnings calls. Quality varies; often lightly edited.
11. **AlphaSense / Refinitiv / EIKON India** — paid institutional transcripts. Use for companies with thin retail coverage (small-cap, pre-IPO).
12. **Bajaj Broking / Motilal Oswal / Antique Stock Broking research portals** — brokerage research desks sometimes publish their own transcripts with commentary. Use with caution — the commentary is biased to the brokerage's view.

#### Fallback when only an audio file exists

1. **YouTube** — search `<company name> Q<N> <year> earnings call`. Many companies upload the audio within 24-48h of the call.
2. **Company IR site audio file** — usually a `.mp3` or `.m4a` URL. Run through `whisper` (Hermes-native `audio` tool, or `openai-whisper` CLI) for a transcript.
3. **Webcast platforms** — `webcast.company.irdomain.com/...` URLs that don't always have a transcript. If the URL is reachable, fetch and use Hermes-native tools to render the page.

#### Fallback when `web_extract` returns only a summary

If you only get a 5000-char LLM-summarized extract from `web_extract`, switch to `mcp_lean_ctx_ctx_url_read` with `mode=text` and `max_tokens=50000` — it returns the full verbatim transcript. Same for `web_search`-only excerpts — the transcript URL is usually one click deep from the search result.

#### Pitfall: free sources often summarize, paywalled sources gate Q&A

The cleanest public transcripts (Motley Fool, EarningsCall.biz, Zacks) cover prepared remarks + the full Q&A but the analysts are anonymized ("Question from John Smith of ..."). Institutional sources (AlphaSense, Refinitiv, Sentieo) tag analyst names + firm affiliations. For thesis work the anonymized version is sufficient; for sell-side consensus tracking you need the attributed version.

#### Pitfall: transcript URL is sometimes 5-10 days late

NSE archives and BSE filings typically post the transcript 5-10 days after the call. If you only get the cover letter (Priya Agarwal digital signature, "Sub: Transcript of Earnings Call held on..." boilerplate) but no Q&A, you have the wrong URL — the real transcript is a separate filing dated 5-10 days later under a different URL. Verify file size > 50 KB before parsing (Pitfall #14).

#### Cross-reference: web-extraction-blocked-snippet-evidence

The transcript and forum sources above sometimes return only partial content because of Cloudflare / Akamai / anti-bot blocks (Technofino, some IR sites, some India retail forums). When `web_extract` returns only the opening post or a 403, **don't treat the failure as missing signal** — capture the substantive content from `web_search` snippets and cite the thread URL with a quality downgrade flag. The recipe + worked examples are in `references/web-extraction-blocked-snippet-evidence.md`. Complements `~/.hermes/skills/devops/web-extract-retry-before-curl/SKILL.md` (which covers retry vs curl) — different failure mode (partial fetch vs timeout), different recovery (snippet side-channel vs curl/browser retry).

### Step 7 — Delegation strategy (the hard lesson)

The default 14-document scope **cannot fit in one delegate_task** at the default 600s timeout. Three patterns to use instead:

1. **One task, narrow scope:** "Extract P&L, BS, CF verbatim from this 10-K URL." 200-300K input tokens consumed is normal; budget for ~300s wall time.
2. **Parallel split:** Up to 3 concurrent tasks. Use for: (a) filings data, (b) peer comp, (c) analyst/news — the three are independent and don't share context. Each returns ~20-30K output tokens.
3. **Do the XBRL pull in-context yourself** with `mcp_lean_ctx_shell` + `curl`. It's faster and more reliable than delegating, and you control the timeout. Save the JSON to `/tmp/<ticker>_xbrl.json` for reuse.

If a delegation times out, **don't just retry** — narrow the scope, switch to in-context extraction, or split into smaller tasks. Two of three parallel delegations failing on the same root cause (SEC fetch bottleneck) is the pattern to design around.

### Step 7.1 — Python parse path on this Pi: prefer `pdf_doc_parse`, fall back to `pdftotext`

When converting IR PDFs (annual reports, quarterly results, investor presentations) to searchable text, the **default path is the native `pdf_doc_parse` tool** — it routes through PyMuPDF4LLM (layout-aware) + RapidOCR + MarkItDown and returns Markdown with tables preserved. See the India-specific recipe below for the full rule.

**On this Pi** (Hermes deployment), the system Python (`/usr/bin/python3` 3.13) and the Hermes venv Python (`~/.hermes/hermes-agent/venv/bin/python` 3.11) both exist; pymupdf4llm is pre-installed in the venv, but doing `pip install --target=...venv/site-packages --break-system-packages` to a venv silently breaks installed `.so` files (wrong Python ABI). Pitfall details + recovery recipe: `hermes-operations-troubleshooting` §K.1, `ocr-and-documents` PITFALL section.

**For one-off PDFs:** use `pdf_doc_parse(path=..., format="markdown")` — same engine, no path juggling, no Python version risk.

**For batch jobs:** invoke the Hermes venv python directly:
```bash
/home/pi/.hermes/hermes-agent/venv/bin/python -c "import pymupdf4llm; ..."
```

**Last-resort fallback if neither is available:** `pdftotext -layout` (poppler). Loses some column alignment vs PyMuPDF4LLM but produces readable text from any native-PDF. Use when you don't want any install risk on a one-shot run.

### Step 8: Canonical SEC-extraction subagent recipe (the pattern that works)

**The 2026-06-28 <TICKER> run is the source of these rules.** First attempt: one large subagent that pulled 10-K + 10-Q + XBRL + investor presentation + press release + 3 transcript URLs. It hit both the 600s wall clock AND the 50-iteration cap, returned no usable output. Recovery subagent (focused, single-purpose, narrow) returned in ~3 minutes. This is the split that works.

**Recipe: one subagent per major filing, three sequential or parallel tasks max.** Never one subagent per company. Never one subagent for the full 14-doc default scope.

**Default split for a 2-year US sweep (8 quarters + 2 annuals):**

| Subagent | Scope | Toolsets | Expected wall time |
|---|---|---|---|
| **A. Filings data** | "Extract P&L, BS, CF verbatim from this 10-K URL and this 10-Q URL. Return markdown tables." | `web` only (no `terminal` — keeps the subagent from trying to parse XBRL inline) | 200-400s |
| **B. Peer comp** | TTM P&L/BS/CF ratios + multiples for 6-8 named peers | `web` | 200-400s |
| **C. Analyst + news + short interest** | Consensus PT, recent news, Form 4, short interest | `web` | 200-400s |

Run **A, B, C in parallel** (3 concurrent, the max). If A times out, **narrow it further** — spawn A1 for 10-K only, then A2 for 10-Q only, sequentially. The 10-K alone is the highest-value document; get it first.

**What subagent A's prompt MUST include** (these are the four things that fixed the <TICKER> recovery):
1. **"Verbatim, not summarized"** — explicitly say "return the exact numbers from each statement, not summaries." Without this, subagents paraphrase and you lose auditability.
2. **"Markdown tables with these line items"** — name the line items you want. Don't let the subagent decide which are important.
3. **`toolsets=["web"]` only** — exclude `terminal` so it doesn't try inline XBRL parsing.
4. **Direct URL in the goal** — don't make the subagent search EDGAR for the filing; give it the URL you already verified in Step 2.

**What the failed subagent had that the recovery didn't:**
- Tried to do 6 jobs (filings + transcripts + IR materials + press release) in one task → ran out of iterations before the SEC data was even parsed
- Had both `web` AND `terminal` toolsets → started trying to inline-parse 8MB of XBRL JSON
- Goal said "raw numbers" but didn't say "verbatim" or "markdown tables" → subagent produced a narrative summary instead

**The XBRL inline-parse failure mode is a subagent pattern, not a Hermes bug.** The 8MB JSON is too large for a subagent's context to chew through within 50 iterations. If you want XBRL data, **pull it yourself in-context** via `mcp_lean_ctx_shell` + `curl`, save to `/tmp/<ticker>_xbrl.json`, then either (a) parse it yourself with a Python script, or (b) pass the file path to a focused subagent with `terminal` toolset and the specific concepts to extract.

**If you must delegate XBRL parsing** (e.g., for a multi-company sweep), spawn a separate subagent per *concept family*: one for revenue/COGS, one for BS line items, one for CF. Three subagents × 5-10 concepts each = tractable, vs. one subagent trying to map 50+ concept names in one go.

---

## Part 1 — The Three Statements (in 60 seconds)

Always read in this order. Each statement answers a different question and they are linked by accrual accounting.

### 1. Income Statement (P&L) — *"Did we make money?"*
**Question:** Over the period, did revenue exceed expenses?
**Key lines (top → bottom):**
- Revenue → COGS → **Gross profit** → Operating expenses → **Operating income** → Interest/taxes → **Net income** → EPS
- EBITDA = earnings before interest, taxes, depreciation, amortization. Quick profitability proxy; ignores capital structure.
**What to look for:** revenue trend QoQ, gross margin trend, operating leverage (opex growing slower than revenue = margin expansion), EPS vs. consensus.

### 2. Balance Sheet — *"What do we own and owe?"*
**Equation:** `Assets = Liabilities + Owners' Equity`. Snapshot at one date.
- **Assets:** current (cash, AR, inventory) and non-current (PP&E, intangibles, goodwill).
- **Liabilities:** current (AP, short-term debt) and long-term (bonds, deferred tax).
- **Equity:** paid-in capital + retained earnings − treasury.
**What to look for:** working capital trends, debt/equity, goodwill as % of assets (acquisition bloat), cash burn runway.

### 3. Cash Flow Statement — *"Did the money actually move?"*
Three sections, reconciles to balance-sheet cash:
- **Operating (CFO):** cash from the actual business. The cleanest health signal — earnings can be paper, CFO cannot.
- **Investing (CFI):** capex, acquisitions, asset sales. Heavy capex is normal for some industries, alarming in others.
- **Financing (CFF):** debt issuance/repayment, buybacks, dividends.
**The link:** Net income → CFO via the indirect method (add back D&A, adjust working-capital changes). If net income is high but CFO is low or negative, **accruals are doing the work** — and that's a warning sign.

> **First-pass check:** `CFO / Net Income` ratio. Above 1.0 sustainably = high-quality earnings. Persistently below 0.8 = accruals are inflating reported profit.

---

## Part 2 — Ratio Analysis (SPELL Framework)

Five categories cover most of what matters. Always compare across time (trend) and across peers (industry) — a ratio in isolation is nearly meaningless.

| Category | Question | Key Ratios |
|---|---|---|
| **S**olvency | Can the company survive long-term? | Debt/Equity, Debt/Assets, Interest Coverage (EBIT/Interest), Altman's Z |
| **P**rofitability | How much does each dollar earn? | Gross Margin, Operating Margin, Net Margin, ROA, ROE |
| **E**fficiency | How well does management use assets? | Asset Turnover, Inventory Turnover, Days Sales Outstanding (DSO), Days Payable (DPO) |
| **L**iquidity | Can it pay short-term bills? | Current Ratio, Quick Ratio (acid test), Cash Ratio |
| **L**everage | How much debt is financing the business? | Debt/EBITDA, Net Debt/EBITDA, Equity Multiplier |

### DuPont Decomposition (the only ratio that earns its keep alone)
`ROE = Net Margin × Asset Turnover × Equity Multiplier`
A falling ROE can be diagnosed: is it margins (pricing power lost?), turnover (inefficiency creeping in?), or leverage (deleveraging)?

### Working Capital Watchlist
- **Inventory growing faster than revenue** = demand softening or channel stuffing.
- **Receivables growing faster than revenue** = customers paying slowly; possible revenue-recognition gaming.
- **Payables growing faster than COGS** = supplier stress (or smart treasury management — context matters).

---

## Part 3 — Earnings Call Analysis

The call is a 45-minute interrogation under pressure. It has three phases; weight them differently.

### Phase Map

| Phase | Duration | What to track |
|---|---|---|
| Safe-harbor / legal | 1–2 min | New or expanded safe-harbor language (signals new risk categories) |
| CEO prepared remarks | 8–15 min | Metric citations, segment emphasis, **what's absent** |
| CFO prepared remarks | 8–12 min | Guidance language, margin commentary, one-time items, cash flow narrative |
| Q&A | 20–40 min | **Deflections, persistence, tone shifts — this is where signal lives** |
| Closing | 1–2 min | Final framing language |

> **Structural tell:** if a call ends at 45 min when prior three ran 60+ min, management is managing the clock. If Q&A is cut short after a difficult question, that's a signal.

### What to Track in Prepared Remarks
1. **New metrics appearing.** When a company suddenly cites "adjusted bookings" or "committed ARR" after quarters of GAAP revenue, existing metrics usually weakened. The substitution *is* the signal.
2. **Customer language shifting.** Specific named enterprise wins → vague "continued strong demand" = pipeline thinning or churn rising.
3. **Segment emphasis.** A company spending 60% of remarks on Segment B vs. Segment A last quarter is redirecting your attention. Find out why.
4. **Metric drops.** If gross margin appeared in the last three calls and disappears this quarter, something changed. Management doesn't drop a metric when the news is good.

### What to Track in Q&A (the high-value section)
- **Direct answer vs. detour.** A 90-second response to a 20-second question is a non-answer. Track follow-ups: did the analyst re-ask? Did management move on?
- **Deflection to the prepared deck.** "As I mentioned in my prepared remarks…" = avoidance.
- **CEO vs. CFO domain.** CEO deferring to CFO on operational questions is fine; CEO deferring on growth/strategy questions = distancing.
- **Tone shifts.** Compare this quarter's Q&A word choices to prior three. "Strong momentum" → "solid performance" → "resilient results" is a 3-quarter downtrend in confidence.

### Classifying Guidance
| Type | Example | Information weight |
|---|---|---|
| Numeric | "Q4 revenue $5.2B–$5.4B" | Highest — trackable, falsifiable |
| Directional | "Growth will decelerate" | Medium — map to high/medium/low scenarios |
| Qualitative | "Operational excellence is a priority" | Low — almost always true, not useful for forecasting |

**Credibility lever:** check historical guidance accuracy. A company with a high hit rate gets the benefit of the doubt; one that repeatedly walks down ranges gets skepticism.

### Hedging-Language Lexicon
| Confident | Hedging / Avoidance |
|---|---|
| "We will…" | "We expect…" / "We hope…" |
| "On track to…" | "We believe we can…" |
| Specific dates / numbers | "In the coming quarters" |
| Direct causation ("because X") | Macro attribution ("due to headwinds") |

Track the ratio across calls. Spikes in hedging without a corresponding numerical change = warning.

### Voice/Pacing Cues (live listening only)
- Extended pauses before answering forward-looking questions = uncertainty or no prepared answer.
- Rapid clipped answers = defensiveness.
- Steady measured detail = preparedness and operational visibility.
- Pitch/pace shifts mid-answer = the question hit a nerve.

---

## Part 4 — The 7 Red Flags

These have repeatedly preceded stock declines. Spotting one is informational; spotting 2–3 together is a thesis-breaker.

| # | Red Flag | Watch for |
|---|---|---|
| 1 | **Revenue growth deceleration** | 2+ consecutive quarters of declining growth rate; falling below industry average; management attributing to "macro" |
| 2 | **Margin compression** | Gross margin down YoY; operating margin down while revenue grows; one-time-factor excuses that recur |
| 3 | **Guidance below consensus** | Below Street estimates; ranges widening; "meets expectations" only after quiet mid-quarter lowering |
| 4 | **Management tone shift** | Hedging lexicon rising; less specific forward commentary; shorter Q&A answers; CEO→CFO deferrals increasing |
| 5 | **Inventory / receivables outpacing revenue** | Inventory days rising; DSO extending; working-capital deterioration |
| 6 | **CFO/Net Income divergence** | High reported earnings but CFO weak or negative; receivables/inventory accruals doing the work |
| 7 | **Capital allocation surprises** | Buybacks while debt rises; large M&A without integration track record; dividend initiated from stretched balance sheet |

---

## Part 5 — India Regime (BSE/NSE/MCA)

Parts 1–4 (the three statements, SPELL, earnings call phases, red flags) all apply to Indian listed companies. This section covers **what's different**: the source map, India-specific gotchas, and adaptations for the unusual cases.

### 5.1 Filing Equivalents

| US term | India equivalent | Notes |
|---|---|---|
| **10-K** | **Annual Report** | Single PDF. Filed with BSE/NSE under Reg. 34 of SEBI LODR (within 60 days of FY end) + with MCA as AOC-4. Contains: audited financials (Standalone + Consolidated), MD&A, Director's Report, Corporate Governance Report, BRSR (for top 1000), Auditor's Report. |
| **10-Q** | **Quarterly Financial Results** | Filed with BSE/NSE under Reg. 33 within **45 days** of quarter end. Contains: P&L (quarterly + YTD), Balance Sheet, Cash Flow Statement, segment reporting, Limited Review Report from auditors. **No MD&A, no Director's commentary** — Q&A on the concall carries more weight than for US companies. |
| **8-K** (material event) | Outcome of Board Meeting + corporate announcements | Outcome filed within 30 min of board approval; followed by detailed announcement. Material events (acquisitions, fundraising, management change) also filed as separate corporate announcements. |
| **DEF 14A** (proxy) | Postal Ballot notice + AGM Notice + Corporate Governance section in Annual Report | Voting items appear as Postal Ballot filings (e-voting windows) or AGM Notice. Governance disclosures are inside the Annual Report's Corporate Governance section. |
| **13F / 13G** | **Shareholding Pattern** (Reg. 31 of LODR) | Filed quarterly within 21 days of quarter end. Shows promoter, FII, DII, public, and shareholder categories ≥1%. Public equivalent of US institutional holdings disclosure. |
| Sustainability disclosure in 10-K | **BRSR** (Business Responsibility & Sustainability Report) | Mandatory for top 1000 listed by mkt cap from FY23; **BRSR Core** (assured subset) phased in from FY24. Found in the Annual Report. |

### 5.2 Source Map (priority order, all free unless noted)

1. **BSE Corporate Filings & Announcements** — [https://www.bseindia.com/corporates](https://www.bseindia.com/corporates). Hub for: quarterly results (`/corporates/Comp_ResultsNew`), corporate actions, shareholding patterns, board meetings. Best free starting point for any NSE/BSE-listed company (even if NSE-primary — same filings appear on both).
2. **NSE Corporate Filings** — [https://www.nseindia.com/companies-listing/corporate-filings-intimation](https://www.nseindia.com/companies-listing/corporate-filings-intimation). Same filings, NSE-specific listing. Often has better PDF rendering than BSE.
3. **MCA21** (Ministry of Corporate Affairs) — [https://www.mca.gov.in/](https://www.mca.gov.in/). AOC-4 financials, MGT-7 annual return, director details. Use for: older filings, the official statutory record, and verifying anything not yet indexed by BSE/NSE.
4. **Company IR site** — usually the cleanest PDF formatting, and the only reliable source for concall audio + transcripts + investor presentations. Large-caps (Reliance, TCS, HDFC Bank, Infosys) post everything here within hours of board approval.
5. **SEBI** — [https://www.sebi.gov.in/](https://www.sebi.gov.in/) — for SAST (Substantial Acquisition of Shares and Takeovers) filings, insider trading disclosures (Reg. 7(2) — initial + continual disclosures by promoters), and the Integrated Filing (financials) for top 500/1000 listed.

**Third-party aggregators (free tier):**
- **Screener.in** — best free P&L/BS/CF aggregation for NSE/BSE-listed companies; computes ratios and 10-year trends.
- **Trendlyne** — strong on peer comparison, ratios, and quarterly deltas.
- **Tickertape** — fundamentals + shareholder pattern visualisation.
- **MoneyControl** — broadest coverage including SME; data quality varies.

**Third-party aggregators (paid, institutional-grade):**
- **CMIE Prowess** — the institutional standard in India; highest-quality database with consistent line items across companies and years.
- **CMIE Ace Equity** — cheaper Prowess alternative.
- **AlphaSense / Refinitiv / Bloomberg** — for concall transcripts with global coverage.

**Structured-data shortcut:** MCA publishes all company filings in **XBRL** since FY 2011–12 — bulk-downloadable from MCA21. Lets you dump P&L + BS + CF line items across thousands of companies directly into a spreadsheet (equivalent to EDGAR's XBRL frames, but the download UX is clunkier).

### 5.3 India-Specific Gotchas

These are the adjustments that change how Parts 1–4 are applied. Read all of them before pulling data.

1. **Standalone vs Consolidated — pick Consolidated for analysis.** Every Indian listed company files BOTH. Standalone = parent company only; Consolidated = parent + all subsidiaries (per Ind AS 110). For investment analysis **always use Consolidated** — Indian conglomerates (Tata, Reliance, Adani, Aditya Birla, Mahindra) hold most of their operating value in subsidiaries, so Standalone will dramatically understate revenue, profit, and assets. The exception: when investigating the parent's debt structure specifically, Standalone shows parent-level borrowings without subsidiary noise.
2. **Fiscal year = April–March.** "FY25" = April 2024 – March 2025. "Q4 FY25" = Jan–Mar 2025 (also the year-end). Mapping to US quarters: India Q1 ≈ US Q2, etc. Don't mix fiscal labels with calendar labels — a 20% YoY growth claim in "Q3" could mean different things depending on which regime it's from.
3. **Quarterly filings have NO MD&A.** Unlike a 10-Q, the quarterly result PDF is just tables + Limited Review Report. There is no "Management's Discussion and Analysis" section. To get management's quarterly narrative you must rely on the **concall Q&A** and the press release. Weight Q&A analysis more heavily than the US recipe suggests.
4. **Audit status differs across the year.** Q1, Q2, Q3 filings carry a **Limited Review** from auditors (a lighter review per SA 2410). The Q4 + Annual carries the **full statutory audit**. Numbers can shift at year-end when the full audit lands — Q4 standalone vs Annual Consolidated sometimes show small reconciliation differences.
5. **Filing deadlines are wider than US.** Quarterly = 45 days from quarter end (vs 40 in US); Annual = 60 days. For recently-listed companies there's a one-quarter lag in some disclosures. Plan a wider "data freshness window" — the latest quarter's numbers are available roughly 6 weeks after quarter end, not 5 weeks.
6. **Shareholding Pattern (Reg. 31) is your institutional-flow tracker.** Filed quarterly within 21 days. Watch promoter pledge %, FII/DII flow direction, and any new shareholder crossing the 1% threshold. A rising promoter pledge + declining FII stake is a classic stress signal in mid-caps.
7. **Insider trades are public.** Reg. 7(2) of SAST requires continual disclosure by promoters and persons acting in concert. Any promoter buying or selling in the open market must be disclosed to the exchanges within 2 trading days. Use this to gauge promoter conviction.
8. **Related-party transactions are more common and matter more.** Indian promoter-driven companies routinely do related-party transactions (renting from group companies, loans to subsidiaries, brand fees). Check the Annual Report's AOC-2 + the Related Party Transactions section — opaque or rapidly-growing RPTs are a red flag, especially when there's a non-promoter independent director dissent on the audit committee.
9. **One-time items are large and recur.** India has more "exceptional items," asset sales, and tax write-backs than US peers. Always check the notes to accounts for "exceptional items" before trusting reported PAT. Indian banks especially carry large one-off provisions that get reversed in subsequent quarters.
10. **Concall analyst Q&A is bilingual and less aggressive.** Many Indian concalls run in English with occasional Hindi; analyst questions tend to be less confrontational than US sell-side. The signal-to-noise ratio in Q&A is lower, so you may need to extract guidance from prepared remarks more carefully.
11. **Promoter vs Management distinction.** Indian listed companies often have a **promoter** (controlling shareholder, may not be involved day-to-day) and a **Management team** (professional CEO/MD). When they diverge — typically in family-owned businesses — listen for which one the analyst questions are directed at and which one answers. Promoter interventions in Q&A signal either a forthcoming strategic shift or a financial concern.
12. **₹ crore ≠ ₹ million — EPS conversion has a 10× unit trap.** Indian filings report PAT/revenue/EBITDA in **₹ crores** (1 cr = 10 mn INR). EPS is in **₹ per share**. Share count from StockAnalysis / Screener is in **millions**. Correct conversion: `eps_inr = (pat_cr * 10) / shares_out_mn`. Forget the `* 10` and the computed EPS is **10× too small**. Easy to miss because `(94 cr PAT) / (30.76 mn shares) = 3.06` looks plausible until cross-checked against the company's reported FY26 EPS of ~₹30.5. **Always verify** `fy26_pat_cr * 10 / fy26_shares_mn ≈ fy26_reported_eps` before using the projection model — if the ratio is 10, 100, or 0.1 you've hit the trap. Same conversion applies to BVPS (BV total in ₹ cr, BV/share in ₹) and to every per-share valuation metric. See `references/india-data-pull-recipe.md` for the full convention map and verification snippet.

### 5.4 SPELL Adaptations

Most of Part 2 (SPELL) carries over unchanged. Adaptations:

- **Solvency / Leverage** — Indian non-financial companies tend to run higher D/E than US peers (especially infra, capital goods, real estate). Compare to **Indian industry peers**, not US peers. Interest Coverage threshold should be context-adjusted.
- **Efficiency** — DSO is materially higher in India (60–120 days is normal for B2B) than in the US (30–45 days). Adjust expectations accordingly.
- **Liquidity** — Current Ratio of 1.5+ is normal for Indian manufacturing; Quick Ratio of 1.0+ is the practical floor.
- **CFO / Net Income** — still the cleanest red-flag ratio. Same thresholds (≥1.0 sustainably, <0.8 sustained = warning). **For capex-heavy Indian mid-caps this ratio is volatile and trend matters more than level.** A worked example: a precision-engineering mid-cap went from -0.5× (FY22) → 0.07× (FY23) → 1.01× (FY24) → 1.90× (FY25) → 2.09× (FY26) over five years — a 5× swing driven by working-capital normalisation plus order-book-driven payables float. A single-quarter CFO/NI below 0.8× is informational for these names; a *trend* over 4–6 quarters is the real signal. Always plot the 4-year CFO/NI series before drawing conclusions.
- **Tax rate** — India has a concessional corporate tax regime (Section 115BAA: 22% + 10% surcharge + 4% cess ≈ 25.17% effective) and the default regime (30% + cess). The turnover threshold for opting into the concessional regime has been raised multiple times by Union Budget amendments — verify the current threshold against the latest IT Act / CBDT notification before quoting a number. Watch for companies paying effective tax rates far below the regime they sit in — it usually means deferred tax assets or one-off credits, not sustainable advantages.

### 5.5 Banks / NBFCs — Different Format

Banks and Non-Banking Financial Companies (NBFCs) **do not produce a standard P&L or balance sheet**. Their reporting format is prescribed by RBI under Ind AS (for scheduled commercial banks) or by RBI Scale-based Regulation (for NBFCs). SPELL ratios from Part 2 don't directly apply. Use these instead:

| Category | Key ratios / metrics |
|---|---|
| **Profitability** | Net Interest Margin (NIM), Spread, Cost-to-Income Ratio, RoA, RoE, Fee/Operating Income % |
| **Asset quality** | Gross NPA %, Net NPA %, Provision Coverage Ratio (PCR), Slippage Ratio, Standard Restructured Assets % |
| **Capital adequacy** | CRAR (Capital to Risk-Weighted Assets Ratio), Tier-1 capital ratio, CET1 — must meet RBI Basel-III norms (min 15% CRAR including buffers for D-SIBs) |
| **Growth & franchise** | Loan growth YoY, CASA ratio (Current Account Savings Account), Deposit growth, Branch/network metrics |
| **Liquidity (NBFC)** | ALM (Asset-Liability Management) mismatch buckets, on-book liquidity, available credit lines, undrawn sanctions |

- **Red flags specific to Indian banks/NBFCs:**
- Recurring NPA write-offs being reframed as "technical write-offs" without provision cover
- Restructured book growing faster than new slippages
- Yield on assets rising while NIM stays flat (mix shift to riskier lending)
- Large divergence between Gross NPA reported to RBI vs disclosed in notes
- Loan growth outpacing deposit growth + borrowings (liability-side stress)
- IL&FS-style NBFC: short-term commercial paper funding long-term assets (ALM mismatch)

**Credit-card-issuer NBFCs (<TICKER> / HDFC Credit Card / ICICI Card / Axis Card)** have a different data model again — see §5.8 below for the credit-card-specific metric set (transactor / revolver / EMI mix, IER / IBNEA, Yield − COF, Credit Cost %, Stage 1/2/3, CAR). The two-deck sweep at the end of §5.8 covers the full trend story on ~2 PDFs vs the 14-document default.

### 5.6 Earnings Call — India Adjustments

The Phase Map from Part 3 applies, but expect:
- **Shorter prepared remarks** (5–10 min typical) — weight Q&A more.
- **Guidance specificity varies widely by company tier.** Mid-cap and small-cap companies tend to give **directional** guidance ("we expect double-digit growth," "EBITDA margins will improve"). **Institutional-grade mid-caps and large-caps** (<Company>, Polycab, Persistent, Divi's, Coforge, Astral, Trent, etc.) increasingly give **numeric** guidance with concrete numbers and ranges — e.g. "₹250–300 cr capex over 2 years," "₹5,000 cr closing order book," "FY27 revenue growth 80%+ ±5%," "EBITDA margin ~24%." For these names, treat numeric guidance as you would for US names. Don't apply the "Indian companies don't give numbers" heuristic reflexively — check the most recent call.
- **Analyst turnout smaller** — typically 10–20 analysts vs 30+ at US large-caps. Questions can repeat across calls.
- **Promoter presence** — at promoter-driven companies, the promoter may speak first or last, with framing implications. A promoter who's suddenly on every call after years of silence = signal.
- **Where to get the transcript (priority order):**
  1. **NSE archives** (`nsearchives.nseindia.com/corporate/<TICKER>_<date>_<time>_Transcript*.pdf`) — cleanest PDF rendering, usually posted 5–10 days after the call.
  2. **Company IR site** (e.g. `mtar.in/wp-content/uploads/<YYYY>/MM/...`) — official copy, may have minor redactions, but always available.
  3. **BSE corporate announcements** (`bseindia.com/xml-data/corpfiling/AttachHis/...`) — also posted; PDF can be more compressed.
  4. Third-party (AlphaStreet, Tickertape transcripts, Trendlyne) — last resort, may have light editing.
- **The investor presentation deck filed alongside quarterly results is the cleanest MD&A substitute for India.** Since the Quarterly Financial Results PDF has no MD&A, the presentation deck (filed same day, on BSE/NSE under the same Reg 33 / Reg 30 announcement) carries segment-wise revenue mix, order-book build-up, working-capital days, customer/geography split, and a historical P&L/BS/CF table going back 3–4 years. Always pull this alongside the concall.

### 5.7 When NOT to Use This Section

- **ADR-listed Indian companies** (Infosys ADR, ICICI Bank ADR, HDFC Bank ADR) — file 20-F with the SEC and reconcile to US GAAP. Use Parts 1–4 unless the user explicitly wants the India-listing perspective.
- **SME-listed companies on BSE/NSE SME platform** — lighter disclosure regime (half-yearly results only, no consolidated required for some), reduced applicability of full SPELL analysis. Stick to the Annual Report + concall.
- **Municipal bonds, REITs, InvITs** — different regulatory regime (SEBI REIT/InvIT Regulations 2014); use a debt-focused framework instead.

### 5.8 Credit-Card Issuers (<TICKER> / HDFC Credit Card / ICICI Card / Axis Card)

Banks and NBFCs running credit-card books follow a different data model than general corporate P&L work. Indicators you won't see in a normal 3-statement analysis but MUST capture:

**Behavioral mix (the leading indicator):**
- Transactor % (pays-in-full every month)
- Revolver % (carries balance — interest-earning receivables, IER)
- EMI % (converts purchases to EMI)
- IER % of total receivables (drops as revolver % drops)
- IBNEA % (interest-bearing non-earning assets — asset-quality headwind)

**P&L specific to cards:**
- **Yield %** (interest income / avg receivables)
- **COF %** (cost of funds / avg borrowings) — split between reported and daily-weighted (card issuers use lease adjustments that move reported COF)
- **NIM = Yield − COF** — the structural margin per rupee of receivables
- **Credit cost %** (impairment / avg receivables) — the dominant lever; 6-9% range normal
- **Cost-to-Income** (opex / pre-credit-cost income) — fees & spends-based costs inflate this; >50% is the watch-threshold
- **Write-off % vs provision %** — split between write-off-driven credit cost and forward-looking provision build

**Asset quality specifically:**
- **GNPA % / NNPA %** — RBI Scale-Based Regulation definition
- **PCR (Provision Coverage Ratio)** — should be >50%; dropped during the FY25 stress cycle
- **Stage 1/2/3 mix** — IFRS 9 ECL buckets: Stage 1 (current), Stage 2 (30-89 DPD + high-risk), Stage 3 (90+ DPD + restructured)
- **ECL %** (total provisions / total receivables)

**Capital:**
- **CAR %** (CRAR) — RBI Basel-III minimum 15% incl. buffers for NBFCs
- **Tier 1 %** — usually >15% for credit-card NBFCs
- **Borrowings mix** — WCDL / CP / NCD / Term Loan split drives COF trajectory (mix shift to NCDs over WCDLs is the typical favourable move)

**What to watch that doesn't appear on a normal P&L:**
- New accounts sourcing trend (cards-in-force = vintage − attrition; YoY decline in sourcing = future receivables headwind)
- Corporate card segment growth (disproportionate ₹ growth = strategic mix shift with different unit economics)
- UPI on Rupay card metrics if applicable (new channel with different cost structure)

**Two-deck sweep for trend analysis (validated 2026-07-01 on <TICKER>, ~80% fewer PDFs than the full 8-quarter default):** When the question is "show me the last 2 years of trends", pull the **Q4 FY(current) investor presentation** (gives the latest-FY-vs-prior-FY summary panel + 5 quarters of detail) plus the **Q4 FY(prior) investor presentation** (gives 4 more quarters of history). The investor presentation deck is the right artifact — it has reconciled trend tables and is what management chose to publish, so it's authoritative. Going wider is unnecessary for most trend questions and burns time on 6+ more PDFs. For a thesis memo on the most recent FY (not just trends), revert to the full 8-quarter scope.

**Charting template:** `templates/credit_card_issuer_charts.py` produces the canonical 4-panel output (revolver mix stacked bar, spends dual-axis, profitability bars+lines, FY 3-panel snapshot). Adjust the four DATA blocks at the top for the issuer — chart structures are reusable across any RBI-regulated card company.

See **[references/india-sources.md](references/india-sources.md)** for a deep source map (URLs, search patterns, what each source is best for) that can be handed to a research subagent.

### 5.9 India Retail-Investor Forum Sweep

For India-listed companies, the retail-investor discussion is denser and structurally different from the US. The single "go-to" venue is **ValuePickr**, but several parallel venues carry meaningful commentary that ValuePickr itself doesn't aggregate. Run all of the following where coverage exists; treat the output as a *second* opinion stream that frames how the informed-amateur base is thinking, not as a primary source for numbers.

#### Tier 1 — primary research-grade

1. **ValuePickr** (`valuepickr.com`) — India's most widely-read long-form retail-investor forum, with a documented process: Stock Story → Stock Analysis → Stock Research → Forum thread per name. Surfaces multi-year, multi-author diligence with disagreement surfaced, not smoothed.
   - **Search recipe:** Run a web search for `<TICKER_OR_COMPANY_NAME> site:valuepickr.com`. Parse the results for links into the forum category (`/page/N/`, `/forum/...`, `/topic/...`). Most listed names above ~₹1000 cr mkt cap have a dedicated thread. Use `web_extract` (or `mcp_lean_ctx_ctx_url_read` with `mode=markdown`) on the candidate thread page to read it; if it has no hits for the company, fall back to the thread index at `https://www.valuepickr.com/forum/` and `https://www.valuepickr.com/forum/<category-slug>/` (categories are usually "Indian Stocks", "International Stocks", "Investing Ideas"). Browse the relevant category and grep the company's name across the first 5–10 pages.
   - **Stock Story / Stock Analysis / Stock Research pages** (front-end, not forum) are also worth pulling — they are single-author deep dives. The category slugs are `https://www.valuepickr.com/stock-story/`, `/stock-analysis/`, `/stock-research/`.
   - **Time bound: last 2 years only.** Anything older is stale context (post-IPO India retail sentiment shifts fast). Apply the date filter on the thread, or skip the first N pages of the thread until you land on posts dated within the last 24 months.
   - **Pre-Register gate:** Management Q&A and certain forum posts require free login (`"Management Q&A requires free login, if you do not have a login ID, please request for one using the Pre-Register link"`). If a key post is gated, flag it as `"<gated — login required>"` in the memo and proceed with the public thread.

2. **Capitalmind** (`capitalmind.in`) — Deepak Shenoy's India-focused equity research platform. Has both free long-form posts and a paid "Premium" tier. The free tier carries monthly market commentary + individual stock deep-dives. **Note:** if you have a Capitalmind Premium account, pull from the Premium archive first — coverage is denser than the free tier. The site also runs a community comment section under each post that captures retail discussion; quality is higher than ValuePickr on macro and portfolio-construction topics.
3. **Trendlyne discussion / comments** (`trendlyne.com/equity/<...>/<TICKER>/discussion`) — comment threads under each stock's page on Trendlyne. Lower average quality than ValuePickr but volume is high. Useful for catching short-term sentiment shifts and contrarian views that the ValuePickr crowd hasn't surfaced yet. Filter for posts with 10+ upvotes from the last 6 months.
4. **Tickertape discussion** (`tickertape.in/stocks/<ticker>/discussion`) — smaller community but higher quality on quantitative screens. The "Tickertape Premium" section has paid model portfolios — useful for cross-checking retail portfolio-construction patterns.

#### Tier 2 — secondary retail venues (use after Tier 1)

5. **Screener.in comments** (`screener.in/<company>/comments/`) — community comments under each company's Screener page. Often carry detailed financial analysis (users paste their own Excel work). Quality varies; ignore the one-liners, weight the 200+ word posts with charts.
6. **r/IndiaInvestments** (`reddit.com/r/IndiaInvestments`) — Reddit's main India-investing community. ~150K subscribers, mix of newbies and experienced retail investors. Coverage of individual NSE-listed names is moderate; coverage of macro/regulatory topics is excellent (SEBI, RBI, budget). Filter for posts with 50+ upvotes in the last 24 months.
7. **r/IndianStockMarket** (`reddit.com/r/IndianStockMarket`) — smaller, more retail-focused than r/IndiaInvestments. Often the densest discussion of small/mid-cap names is here, not on ValuePickr.
8. **r/Dhan** (and the broader Dhan investor community) — Dhan is a discount broker that runs an active investor community. Posts are typically tied to trading setups rather than long-form DD, but the volume of small-cap commentary is high.
9. **Equity-research Substack authors (India-focused):**
   - **Capitalmind Premium** (already covered above)
   - **Buyside Minds** (`buysideminds.substack.com`) — fundamental + quant blend, India-focused
   - **Equity Research by Zerodha Varsity** (`zerodha.com/varsity`) — free, not Substack per se but the closest Indian analog to a long-form retail education platform. Varsity modules don't cover individual names, but they're a strong baseline for understanding the framework any retail investor is using.
   - **Kuvera blog** (`kuvera.in/blog`) — long-form personal-finance + stock DD posts
   - **Smallcase Discover** (`smallcase.com/discover`) — thematic portfolios with commentary; useful for sector-level sentiment
   - **Tickertape blog** (`tickertape.in/blog`) — individual stock + thematic deep-dives
10. **SEBI-registered Investment Adviser (RIA) blogs / YouTube channels** — many RIAs publish free weekly notes. Quality varies wildly; weight only those with disclosed track records. Sample of high-signal India RIAs (verify each before weighting):
    - **FreeFinCal** (Patwa Financial Educators) — long-form, free, public track record
    - **Jama Punja** (Basant Maheshwari) — short-form YouTube, mid-cap focus
    - **Prudent Equity** (Eklavya Doval) — long-form YouTube + blog, mid/small-cap focus
    - **Invest Yadnya** — Hindi + English, deep-value focus
    - **Value Research** (online magazine) — broader personal-finance + stock commentary
    - **Equitymaster** (`equitymaster.com`) — long-running India equity research site with detailed company pages

#### Tier 3 — sentiment aggregators (light coverage, last resort)

11. **MoneyControl message boards** (`moneycontrol.com/company-redirect/<...>`) — populist retail discussion. Volume is enormous; quality is low. Use only for the post-volume metric (sudden spikes = something happened) and for the "poll" widget on each stock page (bullish/bearish %).
12. **StockTwits India** (`stocktwits.com/symbol/<TICKER>.IN` or equivalent) — international StockTwits has India coverage. Sentiment-only.
13. **Twitter/X India finance accounts** — sentiment + occasional thesis. Same caveats as US X accounts: weight only named analysts with disclosed track records. Sample of high-signal India finance accounts (verify each before weighting):
    - **Deepak Shenoy** (`@deepakshenoy`) — Capitalmind founder, posts portfolio commentary
    - **Vishal Khandelwal** (`@safalniveshak`) — Safal Niveshak, value investing focused
    - **Basant Maheshwari** (`@BasantMaheshwari`) — mid/small-cap focus
    - **Morgan Housel** (`@morganhousel`) — global, but India-relevant macro commentary
    - **Ruchir Sharma** (`@ruchirsharma1`) — global macro, India-relevant
    - **Aakash Shah** (multiple) — long-form India DD threads

#### Tier 4 — Telegram + closed communities (last resort, often gated)

14. **Telegram stock-specific groups** — many active India stock-investing communities exist on Telegram. Quality varies from excellent (small curated groups) to terrible (pump-and-dump signal channels). Hard to discover from search engines; usually referenced in existing ValuePickr/Screener posts.
15. **WhatsApp investor groups** — even more closed than Telegram. Generally inaccessible from outside the network.

#### Scope rule

Tier 1+2 venues cover **NSE/BSE-listed** Indian names. **Do not run this sweep for ADR-listed Indian companies** (Infosys ADR, ICICI Bank ADR, etc.) — use the SEC/10-K + US Earnings Call recipe instead. **Skip** for SME-platform names, REITs/InvITs, and municipal bonds — coverage is thin or absent on every venue.

#### What to extract (use the 5-bullet structure below)

1. **The base-bull thesis as the forum consensus across all venues.** Quote 1–2 sentences in the author's own words; do not paraphrase into your own voice. If there's no consensus (a healthy ecosystem will have both bull and bear), state the spread and which venues lean which way.
2. **The most-cited counter-argument.** Even a widely-held name has detractors. The single most-rebutted counter across the venues is usually the cleanest risk for your memo. Quote it.
3. **The "what changed" thread between 6 and 24 months ago.** Search for posts dated 6–24 months back and summarise what the base was saying then vs now. Convergence = the thesis is hardening; divergence = the base is re-evaluating and your memo should flag that.
4. **Long-form deep-dives that the community has elevated.** These are the front-end deep-dives from any of the Tier 1+2 venues. Pull the URL and the date, summarise in one paragraph each (the author did the work — credit them in the memo by username if the post carries it).
5. **PROMOTER/MANAGEMENT posts by the company team.** Some Indian companies (and their IR/PR firms) post directly on ValuePickr / Capitalmind / Twitter to address retail concerns. These are unusually high-signal; tag them separately in the memo and quote verbatim.

#### Output format — append a new section to the memo, in this exact shape

```
## India Retail-Investor Forum (last 2 years)
- Coverage: <comprehensive / partial / thread-only / none>
- ValuePickr thread URL: <url> (or "no dedicated thread — <category-page> most relevant")
- Parallel-venue coverage: <list other venues that had meaningful posts>
- Consensus thesis: <1–2 sentence direct quote or paraphrase with author + venue>
- Top counter-argument: <1–2 sentence direct quote with author + venue>
- Conviction trend (6–24mo): <hardening / softening / re-evaluating / unchanged>
- Elevated deep-dives (Story/Analysis/Research): <list of urls + venue + 1-line each>
- Promoter/management posts: <list of urls + venue + 1-line each, or "none">
- Gated posts not pulled: <list, or "none">
```

#### Time budget

- 12-20 min on a name with comprehensive coverage across Tier 1+2 (ValuePickr thread + 1-2 Capitalmind/Tickertape posts + Screener top comments + Reddit mentions). The expanded venue map is wider than the original single-ValuePickr sweep; budget accordingly.
- 5-8 min on a name where coverage is partial.
- Skip the section entirely on a name with no Tier-1 thread and no Tier-2 mention — note in the memo as `"India retail forum: no coverage in last 2 years"`.

#### Pitfalls specific to the India forum sweep

1. **Don't treat forum consensus as a buy/sell signal.** ValuePickr / Capitalmind / the Reddit subs are structurally long-biased and famous for both big calls and big misses. The forums' *reasoning* (cited, rebuttable) is the value; the *verdict* is not. Always cross-check against your SPELL/red-flag work from Parts 1–4.
2. **The forums are public, so the smartest participants post cautiously.** The best retail research on Indian names often lives on internal channels (Telegram groups, Substacks, Substack-adjacent blogs like Capitalmind Premium). Use the public venues as the open floor; cross-check serious claims against Screener.in data or BSE/NSE filings before treating them as load-bearing.
3. **Currency: ₹, not $ or €.** All venues report market cap, revenue, and PAT in **₹ cr** (1 cr = 10 mn INR). Don't mix with US-source numbers without the 10× conversion noted in §5.3 item 12.
4. **Dates: Indian fiscal year.** A post dated "FY26" means April 2025 – March 2026. A post dated "Q3 FY26" means Oct–Dec 2025. Map to calendar dates when you cite the post in the memo.
5. **Pre-Register / login gate:** if a key Management Q&A post is gated and you don't have a login, do not paraphrase. Either quote the public summary that other forum members have posted, or leave it as `"<gated>"`. Making up the content of a gated post is a hard error.
6. **Don't ship the India retail section as a separate doc.** It is a *section* appended to the standard memo, not a standalone report. The 5-bullet block fits in one screen and stays current because it points at URLs, not copied text.
7. **Skip on ADR-listing and SME-platform names** — see Scope rule above. Including it for a US-listed Indian ADR is a misread; including it for a non-covered SME name wastes time and produces a "no coverage" line that's noise.
8. **r/IndiaInvestments is macro-heavy, less individual-name focused** — for individual small/mid-cap coverage, prefer r/IndianStockMarket or the Tier-1 forums. Use r/IndiaInvestments for SEBI/RBI/regulatory discussion.
9. **Twitter / X India "finfluencers" without track records** — same pitfall as the US version. Verify the account's track record before weighting. Many accounts with 50K+ followers have no disclosed performance history.
10. **Telegram groups are almost always closed** — even if you find a reference to one in a public post, joining requires an invite link from an existing member. Don't waste time searching for these from outside the network. If a Telegram thread's content is referenced in a public ValuePickr/Screener post, treat that as the only signal you can pull.
11. **Capitalmind Premium is the densest paid source** — if you have access, weight it above the free Tier-1 venues. If you don't, fall back to the free Capitalmind posts + ValuePickr.
12. **Don't pad with Tier-3/Tier-4 if Tier-1+2 gave you a strong result** — same pitfall as Part 7. The 5-bullet output has a fixed size; reserve Tier-3/Tier-4 for cases where Tier-1+2 was thin or where sentiment diverges sharply from the structural thesis.
See **[references/india-data-pull-recipe.md](references/india-data-pull-recipe.md)** for a copy-pasteable end-to-end curl + pymupdf4llm/pdf_doc_parse + memo workflow grounded in a canonical India run (worked example: a precision-engineering mid-cap; CFO/NI swing from -0.5× to +2.1× over 5 years is the headline insight). Includes the time budget (≈38 min cold, ≈10 min on a re-run via manifest), the 5 must-follow pitfalls, plus 9 additional lessons (CFO/NI as the lead signal, segment-mix inconsistency, Q4 supersedes Q1-3 for narrative, India-concall disclosure bias, order-book book-to-bill checks, NSE vs BSE URL patterns, etc.). **Start here for any new Indian company.**

When the user asks for a **buy/hold/sell call with a target price and horizon** (e.g. "what would you do," "should I buy this," "give me a target"), additionally load **[references/thesis-memo-reco-template.md](references/thesis-memo-reco-template.md)**. That file specifies: (a) defaults (12m horizon, 50% multiples + 30% DCF + 20% RIM blend, 12.5% WACC for India mid-caps, scenario haircuts on management guide), (b) the three-method PT computation (DCF + Peer multiples + RIM), (c) the bull/base/bear + probability-weighted PT output, (d) action rubric (Buy / Hold / Sell with conviction tiers), (e) the extra sections to add to the memo (valuation framework / scenario logic / catalysts / sizing / exit triggers), and (f) 8 pitfalls (incl. "don't blend base DCF with bull multiples" and "always publish the disconfirming case"). **Don't shortcut the method math — that's where calibration lives.**

When the user asks for the analysis as a **nicely formatted PDF** (e.g. "give me the analysis as pdf," "export the memo as PDF," "send me the report"), additionally load **[references/pdf-deliverable-from-analysis.md](references/pdf-deliverable-from-analysis.md)**. That file is the canonical recipe for turning a Markdown/JSON-backed research memo into a sell-side-style PDF via fpdf2 + DejaVu Sans. Includes the 7-step recipe (install → JSON inputs → Unicode font → page layout → multi_cell() for body text → vision-review the rendered preview → save the build script alongside the JSONs), 8 pitfalls (incl. "manual word-wrap breaks on page boundaries — use multi_cell()" and "always do a vision_analyze pass to catch silent truncation"), and a 60-min time budget. **The `multi_cell()` lesson and the visual-review loop are non-obvious and saved the <Company> 2026-07-01 build from shipping a PDF with a section truncated to a single word.** Use **[templates/build_pdf.py](templates/build_pdf.py)** as the copy-paste starting point — it has the font-loading, page geometry, and reusable methods (section_title, body, bullet, table, callout) already wired up.

---

## Common Pitfalls

1. **Reading one statement in isolation.** They are linked. A P&L that looks great with weak CFO and rising inventory is not great.
2. **Treating a single EPS beat as a green light.** Beat is priced in within seconds of the press release; the *trajectory* matters more.
3. **Overweighting prepared remarks.** They are scripted and legal-reviewed. Q&A reveals more — but only if you listen for the *non-answers*.
4. **Comparing ratios without context.** A 30% gross margin is great in software, terrible in grocery. Always compare to peers and own history.
5. **Ignoring the missing.** If a metric management cited for six quarters vanishes, that's data. Track presence, not just numbers.
6. **Conflating CFO and CEO statements.** Different incentives, different information. CFO owns the numbers; CEO owns the narrative. Watch for inconsistencies.
7. **A single suspicious quarter isn't a red flag — a *trend* is.** Look for 2–3 quarters of deterioration before downgrading conviction.
8. **Hardcoding XBRL concept names.** `Revenues` is the textbook name, but filers commonly use `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet` + `SalesRevenueServicesNet` + `SalesRevenueGoodsNet` (sum), or other tags. Always grep the XBRL keys for the actual concept used by *this* filer.
9. **Treating a 600s delegation timeout as a retry signal.** SEC filing research routinely needs 300-600s per task. If it times out, narrow the scope or do the work in-context via `mcp_lean_ctx_shell` + direct curl — don't just retry the same task.
10. **Forgetting to set the SEC User-Agent header.** All `data.sec.gov` and `www.sec.gov` requests require `User-Agent: <name> <email>`. Missing or blank → 403 with no body, easy to misdiagnose as network failure.
11. **Always verify CIK before pulling.** CIK 0001650729 is SiteOne Landscape Supply (SITE),
    not <Company>. <TICKER> is CIK 0001618732. The wrong CIK returns *a different real company's*
    filings with no error — silent wrong data. The safe lookup: search EDGAR by ticker first
    (`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<TICKER>&type=10-K`),
    confirm the company name in the response, then use the CIK from the response. This
    matters for every US filer, not just <TICKER>.
12. **BSE/NSE archives require a real User-Agent — same trap as SEC.** `curl` without a
    User-Agent returns exit code 92 silently with no body (Akamai blocks the request). Always
    pass a realistic browser UA: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML,
    like Gecko) Chrome/120.0 Safari/537.36` works for both `nsearchives.nseindia.com` and
    `www.bseindia.com`. Verify with `curl -sLI` (HEAD) before bulk downloads.
13. **Use Hermes-native `pdf_doc_parse` (PyMuPDF4LLM + RapidOCR + MarkItDown) for PDF parsing — `pdftotext` is the legacy fallback.** Indian annual reports and concall transcripts are textually clean (not scanned) but use heavily indented table layouts. PyMuPDF4LLM (the engine behind Hermes's `pdf_doc_parse` tool) is layout-aware and preserves column alignment, so balance-sheet line items stay in their columns. Use `pdf_doc_parse(path="<file>.pdf", format="markdown", ocr="auto")` from a session, or `pymupdf4llm.to_markdown("<pdf>")` in Python for batch (after probing which interpreter has it — see pitfalls list, and `references/india-data-pull-recipe.md` §3d). For visual review of generated PDFs, prefer `pdf_doc_parse(page_chunks=True, write_images=True)` + `vision_analyze` over `pdftoppm`. **`pdftotext -layout`** is a poppler fall-back only — the last-resort path on hosts where neither is available. **Don't reach for `pip install --break-system-packages pymupdf4llm` when `import pymupdf4llm` fails in a script — that's the wrong-python trap (your shell's `python3` may not be the Hermes CLI venv). See `references/india-data-pull-recipe.md` §3d for the probe pattern, and `scripts/parse_pdf_dir.py` for the bundled batch tool that auto-picks the right interpreter.
14. **Indian concall transcripts filed late are not always complete.** NSE archives
    typically post the transcript 5–10 days after the call. If the PDF you fetched
    contains only the cover letter (Priya Agarwal digital signature, "Sub: Transcript of
    Earnings Call held on..." boilerplate) but no Q&A, you have the wrong URL. The
    *real* transcript is usually a separate filing dated 5–10 days later under a
    different URL. Verify file size > 50 KB before parsing.
15. **ValuePickr forum consensus ≠ buy/sell signal.** The forum is structurally
    long-biased and is famous for both big calls and big misses. Treat the *reasoning*
    (cited, rebuttable) as the value, not the *verdict*. Always cross-check any
    ValuePickr thesis load-bearing claim against Screener.in data or the BSE/NSE
    filings before letting it move the memo. Forum threads can also surface a strong
    *counter* argument that is more useful than the consensus — use Part 5.9's
    "top counter-argument" extraction to capture that, not just the bull case.

---

## Verification Checklist (Before You Act on an Analysis)

- [ ] Read all three statements, in order (P&L → BS → CF).
- [ ] CFO/Net Income ratio computed and compared to prior 4–8 quarters.
- [ ] Inventory, receivables, payables compared to revenue growth trend.
- [ ] SPELL ratios computed and compared vs. prior period and 2–3 peers.
- [ ] DuPont ROE decomposition done — know which driver is moving.
- [ ] Earnings call: tracked new metrics, dropped metrics, segment emphasis shifts.
- [ ] Q&A: identified deflected questions and re-asks.
- [ ] Guidance classified by type (numeric/directional/qualitative).
- [ ] Hedging lexicon scored vs. prior 3 calls.
- [ ] Red flags checked — count how many present, look for 2–3+ clusters.
- [ ] **India only:** confirmed the analysis used the **Consolidated** set, not Standalone. If Bank/NBFC, the SPELL framework above doesn't directly apply — use Part 5's bank-specific ratios instead.
- [ ] **India only:** ValuePickr forum sweep appended to the memo (Part 5.9) — coverage flagged, consensus + counter-argument + conviction trend present. If the company is ADR-listed, SME-platform, REIT/InvIT, or municipal-bond, the ValuePickr section is intentionally omitted (note in memo).

---

## Output Template (one-page memo)

```
Company: <ticker>      Date: <quarter/period>
Source documents: <filing URL>, <call transcript URL>

NUMBERS
- Revenue: <vs. consensus, QoQ trend>
- Gross margin: <trend>
- Operating margin: <trend>
- CFO / Net Income: <ratio, trend>
- Inventory / receivables vs revenue: <deteriorating?>

RATIOS (vs. prior period, vs. peers)
- Solvency: D/E <x>, Int cov <x>
- Profitability: GM <x>%, OM <x>%, ROE <x>%
- Efficiency: Inv days <x>, DSO <x>
- Liquidity: Current <x>, Quick <x>
- Leverage: ND/EBITDA <x>

EARNINGS CALL
- New metrics introduced: <list>
- Metrics dropped: <list>
- Guidance type: <numeric/directional/qualitative>, credibility <H/M/L>
- Hedging lexicon vs. prior 3 calls: <rising/stable/falling>
- Q&A deflections: <notable ones>

RED FLAGS TRIGGERED: <0–7, list which>
THESIS STATUS: <intact / weakening / broken>
ACTION: <hold / trim / exit / add>

## ValuePickr Forum (last 2 years)         ← India-listed only; skip for ADR / SME / REIT
- Coverage: <comprehensive / partial / thread-only / none>
- Thread URL: <url or "no dedicated thread — <category-page> most relevant">
- Consensus thesis: <1–2 sentence quote or paraphrase>
- Top counter-argument: <1–2 sentence quote>
- Conviction trend (6–24mo): <hardening / softening / re-evaluating / unchanged>
- Elevated Stock Story / Analysis / Research: <urls + 1-line each>
- Promoter/management posts: <urls + 1-line each, or "none">
- Gated posts not pulled: <list, or "none">

## US Retail Investor Forum (last 2 years)   ← US-listed only; for India names see section above
- Coverage: <comprehensive / partial / thread-only / none>
- Dominant long-form thesis (SA + Substack): <1-2 sentence direct quote with author>
- Top counter-argument (SA comment thread): <1-2 sentence direct quote>
- Conviction trend (6-24mo): <hardening / softening / re-evaluating / unchanged>
- Notable contributors: <2-4 names + their current take>
- Position-sizing signal from informed retail: <rough estimate of weights>
- Gated / paywalled posts not pulled: <list, or "none">
```

---

## One-Shot Recipes

**Quick health check (5 min):**
P&L → BS → CF in order, compute CFO/NI, check inventory vs revenue. If those three pass and the call tone is steady, the thesis is intact pending more work.

**Pre-earnings prep (15 min before the call):**
Read press release. Note which 5 metrics you expect management to cite. During the call, score which ones they actually emphasized. The diff is the signal.

**Post-call reconciliation (15 min after the call):**
For every forward-looking claim in prepared remarks, find the line item in the 10-K/10-Q that supports or contradicts it. Unverified claims → follow up on next call.
*India variant:* reconcile against the **Consolidated** Annual Report / Quarterly Financial Results — the Standalone set excludes subsidiaries and will mislead your analysis (see Part 5). Append a **ValuePickr forum sweep** to the memo (Part 5.9) for any NSE/BSE-listed name — it's the second-opinion stream that surfaces long-form retail diligence and counter-arguments not available in the filings themselves.

**Quarterly review cycle (per company, quarterly):**
1. Pull 10-Q + earnings call transcript.
2. Run the verification checklist.
3. Update ratios spreadsheet (or memory note) with QoQ delta.
4. Score red flags, update thesis status.
5. Re-read the 10-K annually — most of the structural narrative only changes once a year.

*India variant:* pull the Quarterly Financial Results filing from BSE/NSE (under Reg. 33) instead of a 10-Q. Quarterly filings contain **no MD&A**, so weight the concall Q&A more heavily and plan to revisit the Annual Report for management commentary on any structural questions. For NSE/BSE-listed names, also append a **ValuePickr forum sweep** (Part 5.9) so the memo captures the informed-retail view and the dominant counter-argument.

---

## Part 6 — Persistence & Reuse (Cache Manifest)

**Every analysis run saves its outputs to disk and records what was fetched. Future runs consult this manifest and only re-fetch new filings.** This eliminates the biggest source of waste in recurring analysis work: re-downloading the same 10-K every quarter because nothing told the agent it was already on disk.

### Directory layout

All research lives under `~/research/`. Per-company subdirectory, per-filing raw source, plus one memo per analysis run.

```
~/research/
├── <TICKER>/
│   ├── _manifest.json              ← cache manifest (see schema below)
│   ├── sources/
│   │   ├── 10K_FY2025_2025-09-24_accession-0001193125-25-213801.md
│   │   ├── 10Q_Q3FY2026_2026-05-29_accession-0001193125-26-248282.md
│   │   ├── transcript_Q3FY2026_2026-05-27_motley-fool.md
│   │   ├── earnings_release_Q3FY2026_2026-05-28.md
│   │   └── xbrl_companyfacts.json
│   ├── memos/
│   │   ├── 2026-06-28_initial.md   ← most-recent run (today)
│   │   ├── 2026-09-25_post-Q4.md   ← future run, incremental
│   │   └── 2027-01-15_q2-update.md
│   └── peer_comp_2026-06-28.json   ← latest peer comp snapshot
├── VM_W/
│   └── ...
└── _global_manifest.json           ← cross-company index, optional
```

Per-user storage preference (matches memory note about cron/later automation): stable non-cache path, not `~/.hermes/cache`. `~/research/` is the default; override with `FIN_RESEARCH_DIR` env var.

### Cache manifest schema (`_manifest.json` per company)

```json
{
  "ticker": "<TICKER>",
  "cik": "0001618732",
  "exchange": "NASDAQ",
  "regime": "US",
  "fiscal_year_end": "07-31",
  "created": "2026-06-28",
  "updated": "2026-06-28",
  "filings": {
    "10-K": [
      {
        "period": "2025-07-31",
        "filing_date": "2025-09-24",
        "accession": "0001193125-25-213801",
        "source_url": "https://www.sec.gov/Archives/edgar/data/1618732/000119312525213801/ntnx-20250731.htm",
        "local_path": "sources/10K_FY2025_2025-09-24_accession-0001193125-25-213801.md",
        "fetched_at": "2026-06-28T14:00:00Z",
        "sha256": "<hex digest of the saved source body>",
        "verbatim_table_count": 11,
        "parser": "lean-ctx ctx_url_read mode=text"
      }
    ],
    "10-Q": [ ... ],
    "transcript": [ ... ],
    "earnings_release": [ ... ],
    "xbrl": [
      {
        "url": "https://data.sec.gov/api/xbrl/companyfacts/CIK0001618732.json",
        "local_path": "sources/xbrl_companyfacts.json",
        "fetched_at": "2026-06-28T14:00:00Z",
        "sha256": "...",
        "size_bytes": 1234567,
        "as_of": "2026-06-28"
      }
    ]
  },
  "memos": [
    "memos/2026-06-28_initial.md"
  ],
  "peer_companies_analyzed": [
    {"ticker": "PSTG", "as_of": "2026-06-28", "data_source": "StockAnalysis.com TTM"},
    {"ticker": "DELL", "as_of": "2026-06-28", "data_source": "StockAnalysis.com TTM"}
  ],
  "notes": "First analysis run for this ticker. Used XBRL for FY23/FY24/FY25 P&L+BS+CF and 8 quarterly figures (Q1FY24-Q3FY26). Peer comp from StockAnalysis.com."
}
```

The `sha256` of the saved body is the cheap invalidation check: if the source URL is re-fetched and produces a different hash, the source has changed (restatement, amendment) and downstream memos may need updates.

### Refetch policy (read this before pulling any filing)

Before any `web_extract` / `curl` / `ctx_url_read` against a filing URL:

```
1. Read ~/research/<TICKER>/_manifest.json
   → if missing: this is a first-time run, full fetch
   → if present: consult filings.<form_type>[].source_url and .sha256

2. For each filing you intend to fetch:
   - If accession_number is in manifest AND sha256 is recorded:
     SKIP the network call. Read from sources/<file>.md instead.
   - If accession_number is in manifest but sha256 is missing:
     Re-fetch and verify the sha matches; flag drift if not.
   - If accession_number is NOT in manifest (new quarter / new 10-K):
     Fetch, save with sha256, update manifest.

3. Cross-quarter refetch rule:
   The default scope is "8 quarters + 2 annuals" — but if you already
   have older data in sources/ that covers those periods, you do NOT
   re-fetch. You only fetch the NEWEST quarter (or quarters) that
   aren't yet on disk.

4. Drift detection:
   On re-fetch of an existing URL, if the sha256 changes:
   - Save the new version as sources/<file>_v2_<date>.md
   - Do NOT overwrite the old version
   - Add a note in the memo that the source was restated
   - Re-derive any affected ratios in the new memo
```

### Memo format — designed for diffability

Every memo follows the **Output Template** at the bottom of this skill, but persisted as:

- Filename: `memos/<YYYY-MM-DD>_<short-tag>.md` where `<short-tag>` describes why this run happened. Examples:
  - `2026-06-28_initial.md` — first analysis
  - `2026-09-25_post-Q4.md` — next quarterly update
  - `2027-01-15_q2-update.md` — quarterly cadence
  - `2026-08-15_followup-supply-chain.md` — event-driven
- Frontmatter (so a future `grep`/Dataview/ripgrep across memos can compare):

```yaml
---
ticker: <TICKER>
as_of: 2026-06-28
fiscal_periods_covered: [FY2023, FY2024, FY2025, Q1FY2026, Q2FY2026, Q3FY2026]
regime: US
price_at_run: $49.72
thesis_status: intact
action: hold
sources:
  - sources/10K_FY2025_2025-09-24_accession-0001193125-25-213801.md
  - sources/10Q_Q3FY2026_2026-05-29_accession-0001193125-26-248282.md
  - sources/transcript_Q3FY2026_2026-05-27_motley-fool.md
peer_companies: [PSTG, DELL, HPE, MDB, SNOW]
prev_memo: null           # first run; null until a second memo exists
key_deltas_vs_prev: {}    # first run; empty until a second memo exists
---
```

The **`prev_memo` + `key_deltas_vs_prev` pattern** is what makes the cache useful at scale. On the second run:

```yaml
prev_memo: memos/2026-06-28_initial.md
key_deltas_vs_prev:
  revenue_TTM: "+18% YoY → +15% YoY (supply-chain timing)"
  operating_margin: "6.8% → 10.0% GAAP; 22.3% non-GAAP"
  red_flags_added: []
  red_flags_resolved: [revenue_deceleration_attributed]
  nrr: "newly_disclosed_106%"
  consensus_pt_mean: "$57 → $60"
```

Then in the memo body, open with the deltas table — what changed since last run, what was confirmed, what was new — before repeating the unchanged context.

### What gets saved alongside the memo

Per the user's requirement ("save along with it the source data you downloaded"):

| Asset | Saved as | Why |
|---|---|---|
| 10-K / 10-Q text (verbatim, not summarized) | `sources/<form>_<period>_<filing-date>_accession-<acc>.md` | Future re-analysis; sha256 drift check |
| Earnings call transcript (verbatim, full Q&A) | `sources/transcript_<quarter>_<date>_<source>.md` | Quarterly tone comparison; hedging lexicon scoring |
| Press release / 8-K | `sources/earnings_release_<quarter>_<date>.md` | Headline numbers as first reported |
| XBRL company facts JSON (raw) | `sources/xbrl_companyfacts.json` | Faster than re-fetching from EDGAR every time; enables offline ratio computation |
| Peer comp snapshot | `peer_comp_<as_of>.json` | Track how peer multiples move relative to subject company |
| Subagent reports | `subagent_reports/<date>_<purpose>.md` | Audit trail; reproducibility |

**All verbatim, no summarization at save time.** Synthesis lives in the memo; raw lives in `sources/`.

### When NOT to save

- **Speculative one-line ticker checks** ("is $X up today?") — no memo, no source. Use a quote endpoint.
- **Re-runs of the same period with no new info** — update the memo's `updated` field but don't create a new file.
- **Cross-company comparisons** that touch 5+ tickers — save as `comparisons/<topic>_<date>.md` rather than under any single ticker's directory.

### Manifest-update procedure

When the run completes, before declaring done:

```python
# Pseudocode — implement as a helper or subagent step
manifest = load_json(f"~/research/{ticker}/_manifest.json") or new_manifest(ticker)
for fetched in newly_fetched_filings:
    manifest["filings"][form].append({
        "period": ..., "accession": ..., "source_url": ...,
        "local_path": ..., "fetched_at": now_iso(),
        "sha256": sha256_of(saved_body), ...
    })
manifest["updated"] = today()
manifest["memos"].append(f"memos/{today()}_{tag}.md")
write_json_atomic(f"~/research/{ticker}/_manifest.json", manifest)
```

The manifest is the **contract** between this run and the next run. If it's not updated, the next run will re-fetch everything because it can't tell what's already on disk.

### Operational notes

- **Default storage root:** `~/research/` (override with `FIN_RESEARCH_DIR` env var). Stable non-cache path; do not use `~/.hermes/cache/`.
- **Hermes-native tools to prefer:**
  - `pdf_doc_parse` for PDF → Markdown (PyMuPDF4LLM, layout-aware; falls back to RapidOCR for image-only pages). Returns Markdown with tables preserved.
  - `pymupdf4llm` Python import for batch PDF → Markdown conversion in scripts.
  - `vision_analyze` (after `pdf_doc_parse` with `page_chunks=True, write_images=True`) for visual review of generated PDFs — replaces the legacy `pdftoppm -r 90 -png` pipeline.
- **Plain `curl` shell restrictions** may apply on this machine (e.g. no `$()`, no `bash`, no `set -a; source`). If your Hermes environment restricts the shell, use the `execute_code` tool with `from hermes_tools import write_file` for any manifest JSON writes.
- **Subagent isolation:** if you delegate filings extraction to a subagent, have the subagent save its raw output to `~/research/<TICKER>/sources/` directly (it has its own filesystem) and return only the summary + sha256 list. Don't have it return the full text — that wastes context.

## Part 7 — US Retail Investor Forum Sweep

The US analog of ValuePickr's "Stock Story → Stock Analysis → Stock Research → Forum thread" pattern is **Seeking Alpha** (long-form articles + dense comment threads) + **Substack** (individual-author deep dives) + **r/ValueInvesting** (multi-year DD posts). For US-listed names, run this sweep alongside the standard filing-based analysis — same 5-bullet output format as Part 5.9, but the source set is different and the counter-argument content is structurally distinct (institutional readers vs retail).

**Scope rule:** Use Part 7 for **NYSE / Nasdaq / US OTC** listings. Do not use for ADR-listed Indian companies (Infosys ADR, ICICI Bank ADR) — those should use Part 5.9 if you want a retail sweep at all. **Skip** for foreign issuers (LSE, HKEX, TSX) unless the company has substantive US retail coverage on Seeking Alpha.

### Source map (priority order)

#### Tier 1 — primary research-grade

1. **Seeking Alpha** (`seekingalpha.com/symbol/<TICKER>`) — primary. Use the search engine with `site:seekingalpha.com <TICKER>`. Article quality varies wildly; filter for "Long-Term Idea," "Deep Dive," or articles with the Quant rating badge. Comment threads under the most-upvoted articles often carry the strongest counter-arguments.
2. **Substack** (`<ticker> site:substack.com`) — secondary. Individual authors with track records (look for Substacks with explicit portfolio holdings disclosed). Use search snippets + free-tier preview; do not paraphrase gated content.
   - **Named authors worth tracking (general-purpose):** The Generalist (macro/long-form), Doomberg (commodities/macro), NetNet (Jordan Hiss / deep-value), Kyla Scanlon (macro for retail), Value Investor's Journey, The Macro Compass, Bridge the Gap, Forward Guidance (multiple authors), The Best & Brightest (Tae Kim), The Diff, Katusa Research, Doomberg, Money Stuff (Matt Levine / Bloomberg; mirrored to Substack in part). For sector-specific names: Healthcare Uncovered, The Biotech Memes, Doomberg (energy), Oilprice.com newsletter, The Electric (EV), etc.
   - **Note:** Substack paywalls are common. Use the search snippet + free-tier preview for each; do not paraphrase or quote gated posts.
3. **r/ValueInvesting** (`reddit.com/r/ValueInvesting`) — tertiary. Multi-year due-diligence threads. Filter by post length (top posts are usually >5,000 words); skim original post + top 3 comments + any author rebuttals.

#### Tier 2 — secondary retail venues (use after Tier 1)

4. **r/stocks** (`reddit.com/r/stocks`) — broader retail, lower average quality than r/ValueInvesting. Useful for catching popular sentiment and short-term momentum shifts. Filter for posts with 100+ upvotes in the last 24 months; ignore meme-y threads.
5. **r/investing** (`reddit.com/r/investing`) — long-form retail DD with a more generalist (less value-oriented) bent than r/ValueInvesting. Good for index/ETF names; weaker for individual stock coverage.
6. **r/SecurityAnalysis** (`reddit.com/r/SecurityAnalysis`) — closest to the Benjamin Graham / intelligent-investor tradition. Smaller community (~50K subscribers vs ~1.5M for r/ValueInvesting), higher average quality on individual stock DD. Often surfaces academic-grade posts.
7. **r/wallstreetbets** (`reddit.com/r/wallstreetbets`) — sentiment-only, **not thesis**. Useful for catching short-term retail momentum, options flow, and squeeze candidates; do NOT use as primary analysis input. Exception: when the WSB crowd has held a long-term structural position (e.g., GME, BB, AMC, BBBYQ over years) their collective commentary is itself data.
8. **Sumzero** (`sumzero.com`) — institutional-quality research-sharing platform. Long-form DD posts, mostly from professional buy-side / sell-side analysts. Smaller community than SA but higher per-post quality. Free tier limits you to a few posts per month; deep archives require a paid subscription.
9. **Motley Fool Premium boards** (`fool.com/premium/...`) — gated. The Motley Fool's analyst-team articles are useful for retail-following metrics and the "scorecard" tracking of past recommendations. The community board is more populist than SA's. Use only if you have a Fool Premium account.

#### Tier 3 — sentiment and discussion aggregators (light coverage, last resort)

10. **StockTwits** (`stocktwits.com/symbol/<TICKER>`) — sentiment-only, not thesis. Useful for sanity-checking consensus short-term mood; do NOT use as primary analysis input. Look at the Bull/Bear % bar and the top 5 most-liked messages from the last 30 days.
11. **Yahoo Finance message boards** (`finance.yahoo.com/quote/<TICKER>/community`) — populist retail discussion. Quality varies; many one-line bullish/bearish posts. Use only for the post-volume metric (sudden spikes = something happened).
12. **GuruFocus discussion boards** (`gurufocus.com/stock/<ticker>/discuss`) — lower quality but useful for tracking quant-screen sentiment and following specific GuruFocus authors (e.g., Charlie Tian's "Hidden Gem" series).
13. **TIKR forum** (`tikr.com`) — smaller community; mostly retail investors focused on quantitative screens. Useful for cross-checking valuation work from automated models.
14. **Investing.com community** (`investing.com/equities/<ticker>-commentary`) — broad international coverage; the discussion section is light but useful for cross-border sentiment (especially for ADR-listed names).
15. **Company-specific subreddits** — most large-caps have one (`r/Apple`, `r/TeslaMotors`, `r/AMD_Stock`, `r/NVDA_Stock`, `r/AmazonStock`, etc.). Often the densest retail discussion exists here, not in r/ValueInvesting. Worth a one-off subreddit check on each ticker.

#### Tier 4 — short-form / real-time (sanity-check only, never load-bearing)

16. **X / Twitter** — sentiment, not analysis. **Caveat:** a handful of named analysts post their thesis publicly with track records. Use cases:
    - Hedge-fund PMs who post their theses (e.g., specific accounts with disclosed returns — always verify the track record independently before weighting)
    - Sell-side analysts with active accounts (e.g., specific bank analysts who post on their personal account — verify firm affiliation)
    - Company IR official accounts (subscribe; high signal)
    - Sell-side research aggregators (Bloomberg, FT, Reuters reporters)
    - Forums like FinTwit, ValueInvestorsClub-clone accounts (rare, but high quality when found)
    - **Never use anonymous or non-disclosed accounts as primary input.** Even a 100K-follower account with no track record is just sentiment.
17. **Stocktwits / X / Discord "alpha" channels** — sentiment aggregators. Use only to cross-check short-term retail positioning; do not cite in thesis memos.

### Search recipe (use whatever `web` tools are configured in Hermes at runtime — web_search, web_extract, TinyFish, etc.)

1. **Primary**: web search `<TICKER> site:seekingalpha.com`. Parse the top 5-8 results. Open the highest-quality long-form article in the result set; pull the 3 most-upvoted comments as candidate counter-arguments.
2. **Secondary**: web search `<TICKER> site:substack.com`. Parse top 3-5 results. For named authors with track records, follow their work on related tickers if the topic is adjacent. If a Substack author has posted about a peer (e.g., MSFT) and not the subject (e.g., AAPL), check whether their broader thesis generalises.
3. **Tertiary (Reddit, multi-sub)**: run these in parallel —
   - `<TICKER> site:reddit.com/r/ValueInvesting`
   - `<TICKER> site:reddit.com/r/stocks`
   - `<TICKER> site:reddit.com/r/investing`
   - `<TICKER> site:reddit.com/r/SecurityAnalysis`
   - For high-volatility / meme names, also: `<TICKER> site:reddit.com/r/wallstreetbets`
   Filter for posts dated within last 24 months.
4. **Quaternary (for institutional retail)**: `site:sumzero.com <TICKER>` and `site:gurufocus.com <TICKER>`. Often empty; if populated, treat as the highest-signal Tier-2 source.
5. **Named-author check**: if a Substack author has been cited in the SA comments for the subject, do a separate `<author name> <TICKER>` search. Same for SA Quant contributors — `<contributor name> <TICKER>` is a useful check.
6. **Cross-reference (bear case)**: `<TICKER> short thesis site:seekingalpha.com OR site:substack.com` — surfaces bear cases directly. (Often more productive than searching for the bull case, because bears write to differentiate themselves.)
7. **Cross-reference (sentiment)**: `<TICKER> stocktwits` and `<TICKER> twitter` — quick check for short-term retail mood. Don't cite as thesis; just flag if sentiment diverges sharply from the structural thesis.
8. **Time bound: last 2 years only.** Anything older than that is stale context for current valuation/position-sizing.

### What to extract (use the 5-bullet structure below — the shape of every US-regime memo's sweep should be the same so the output is comparable across companies)

1. **The dominant long-form thesis.** Quote 1-2 sentences in the author's own words. If there's no consensus (a healthy SA ecosystem will have both), state the spread. Prioritise articles with Quant ratings or those by authors with disclosed portfolios.
2. **The most-cited counter-argument.** Even a widely-held name has detractors. The single most-rebutted counter on Seeking Alpha comments is usually the cleanest risk for the memo. Quote it verbatim from the comment thread, not the article body.
3. **The "what changed" thread between 6 and 24 months ago.** Search for posts dated 6-24 months back and summarise what the informed retail base was saying then vs now. Convergence = the thesis is hardening; divergence = the informed base is re-evaluating and your memo should flag that.
4. **Notable Substack authors / SA Quant contributors tracking the name.** These are individual-conviction signals. List 2-4 names with their recent take (bullish/bearish/neutral) + 1-line summary of their thesis. If the same author is bullish on a peer (e.g., PLUG) but bearish on the subject, that's worth noting.
5. **Position-sizing signal.** What portfolio weight are the most-convicted contributors using? SA "Long-Term Idea" articles often disclose this; Substack authors with public portfolios sometimes do. Even a rough estimate (e.g., "5-8% position for the most bullish contributors, 1-2% for moderates") gives you a sense of how concentrated the smart-retail base is.

### Output format — append a new section to the memo, in this exact shape

```
## US Retail Investor Forum (last 2 years)        ← US-listed only; for India names use Part 5.9 instead
- Coverage: <comprehensive / partial / thread-only / none>
- Dominant long-form thesis (Seeking Alpha + Substack): <1-2 sentence direct quote with author>
- Top counter-argument (Seeking Alpha comment thread): <1-2 sentence direct quote>
- Conviction trend (6-24mo): <hardening / softening / re-evaluating / unchanged>
- Notable contributors: <2-4 names + their current take>
- Position-sizing signal from informed retail: <rough estimate of weights>
- Gated / paywalled posts not pulled: <list, or "none">
```

### Time budget

- 8-15 min on a name with comprehensive coverage (search → 2 long-form articles → comment thread skim → Substack search → 5-bullet block).
- 3-5 min on a name where coverage is partial.
- **Skip the section entirely** on a name with no SA/Substack/r/ValueInvesting coverage. Note in the memo as `"US retail forum: no coverage in last 2 years"`.

### Pitfalls specific to US forums

1. **Seeking Alpha contributor quality varies wildly** — many authors are short-term traders or affiliate-link spammers, not long-form investors. Filter for: Quant rating badge, "Long-Term Idea" tag, author track record (look at their other articles + comment history). Avoid authors whose primary content is promotional / sponsored.
2. **Substack paywalls** — most premium Substacks are gated. Use search snippets + author free-tier previews. Do not paraphrase or summarise gated content (same rule as ValuePickr's gated-posts pitfall in Part 5.9). Mark gated posts explicitly in the memo's "Gated posts not pulled" line.
3. **Reddit DD posts can be very long** (50+ pages of comment thread). Skim the original post + top 3 comments + any author rebuttals. The most-cited rebuttal in the comments is the cleanest counter-argument; don't waste time reading all 200 comments.
4. **StockTwits is sentiment, not thesis** — useful for sanity-checking consensus mood but do not cite as analysis input. If a SA author's Quant rating moves from Sell → Buy, that's analysis input. If a StockTwits ticker is "trending," that's not.
5. **Avoid X / Twitter as a primary source** — sentiment, not analysis. Use for IR following (subscribe to the company's official account + their IR firm), not for thesis work. The exception: specific named analysts with documented track records (e.g., specific hedge-fund PMs who post their thesis publicly) — cite them by name and link.
6. **Always cross-check against SEC filings** — US retail forums have the same over-confidence pattern as Indian ones (the ValuePickr pitfall #1 applies equally). SA Quant ratings have a documented backtested hit rate of ~65% — useful but not authoritative. The filing is the spine; the forum is the cross-check.
7. **Currency: USD**, but watch for **split-adjusted prices** vs. raw prices in older posts (especially for tickers that did 2:1 or 3:1 splits in the last 5 years). Always verify the post date matches the price level — a "BUY at $300" post from 2021 is nonsensical if the stock is at $60 now after a 5:1 split.
8. **Don't ship the US retail section as a separate doc** — it is a *section* appended to the standard memo, not a standalone report. The 5-bullet block fits in one one screen and stays current because it points at URLs, not copied text.
9. **Skip on ADR-listing, SME-platform names, REITs/InvITs, and municipal bonds** — see Scope rule. Including it for an ADR-listed name is a misread; including it for a non-covered name wastes time and produces a "no coverage" line that's noise.
10. **Penny stocks / micro-caps**: the SA + Substack + r/ValueInvesting ecosystem mostly ignores these. Skip Part 7 entirely for tickers < $1B market cap unless you find genuine coverage.
11. **r/wallstreetbets is mostly noise** — for individual stocks outside the meme category, the discussion is dominated by options-flow commentary and "DD posts" that turn out to be paid pump pieces. Always verify the OP's post history before weighting a WSB post. Exception: sustained multi-year structural positions (GME, BBBYQ, AMC) where the collective commentary is itself data.
12. **r/SecurityAnalysis is small but high-quality** — the community is ~10% the size of r/ValueInvesting but each post averages more rigorous sourcing. If a name has coverage there, treat it as higher-quality than equivalent r/ValueInvesting threads. If a name has no r/SecurityAnalysis coverage, do not over-weight — that's the absence of evidence, not evidence of absence.
13. **Sumzero and Motley Fool Premium are gated** — the free tier on Sumzero caps monthly post views; Fool Premium requires a paid subscription. If the cron task doesn't have credentials, these will return empty. Don't include them in the memo's "Gated posts not pulled" line — that line is for posts you could access but didn't read, not for venues you couldn't access.
14. **Company-specific subreddits are echo chambers** — r/Apple, r/TeslaMotors, etc. are dominated by existing shareholders. Bear-case posts get downvoted; bull-case posts get upvoted. Useful for measuring the *conviction intensity* of the bull base, useless for measuring the actual merits of the bull thesis. Always cross-check against r/ValueInvesting or r/SecurityAnalysis for the same name before weighting.
15. **X / Twitter "finfluencers" with no track record** — high-follower accounts (@StockMKTNewz, @DeItaone, etc.) are news amplifiers, not analysts. Even accounts that look like PMs often have no verified track record. Verify before weighting: does the account publish periodic performance updates? Do they list their positions? Do they have any third-party verification (Twitter Blue ≠ verification of analytical skill)? If the answer to all three is no, treat as sentiment only.
16. **Don't pad the memo with redundant Tier-3/Tier-4 venues** — the 5-bullet output format has a fixed size. If Tier-1 (SA + Substack + r/ValueInvesting) gave you a strong bull thesis and a sharp counter-argument, do NOT add "StockTwits sentiment 65% bullish" as a third bullet — that's padding. Reserve Tier-3/Tier-4 for the specific case where Tier-1 was thin or where sentiment diverges sharply from the structural thesis (then it becomes a notable signal worth flagging).

### Verification checklist additions

When the US Retail Investor Forum Sweep is appended to the memo, add these to the verification checklist:
- [ ] Confirm the counter-argument quoted is from a high-quality author (Quant badge, track record, etc.)
- [ ] Confirm position-sizing signal is from a credible source (disclosed portfolio, not anonymous)
- [ ] Confirm any quoted prices are split-adjusted to current basis
- [ ] Confirm all gated posts are content are flagged, not paraphrased

### Related artifacts

- Part 5.9 — ValuePickr Forum Sweep (India retail-investor sentiment). Use this Part 7 for NYSE/Nasdaq names; use Part 5.9 for BSE/NSE names. ADR-listed names (Infosys, ICICI) — pick one based on which retail base is more relevant for your thesis.
- Part 6 — Persistence & Reuse (Cache Manifest). The 5-bullet output block should be appended to the memo at `memos/<date>_<tag>.md` and the source URLs noted in the frontmatter.

---

## Part 8 — Distribution & Sanitisation

This skill is regularly repackaged into a portable bundle so it can be installed on another Hermes Agent instance. The process is straightforward but mistakes are costly (leaked paths, real user data, machine-specific state). Use this checklist whenever the user asks to "share the skill with someone else" / "package this up" / "make a portable copy" / "sanitise before sending" / "send to another Hermes":

1. **Strip machine-specific data from every file in the bundle.** Never include:
   - Specific tickers/companies the source machine has analysed (replace with `<TICKER>` placeholders)
   - Specific price levels, share counts, named peer entries with their prices (replace with `[X]`/`[Y]`/keep names only as illustrative examples)
   - Hardcoded user paths like `~/code/...` or `~/research/<specific-ticker>_research_<date>.md`
   - Communication handles that link the work to a specific user (Signal numbers, Telegram chat/topic IDs, etc.)
   - Operational state comments like "today's run" or "this machine already has X" — those reference a moment in time, not the class of task
2. **Keep the financial concepts intact.** Source URLs to BSE/NSE/MCA/SEC are public and safe. The reasoning chains (CFO/NI > 0.8×, peer-multiple anchors, ₹ crore unit trap, BSE/NSE UA headers) are the whole point of the skill — don't generalise them away. Replace specific tickers with placeholders but preserve the lesson the specific case taught.
3. **Default the bundle to what the receiving machine likely has, not what the source machine happened to use.** If the source defaults to `pdftotext` but the receiving Hermes has `pdf_doc_parse` (PyMuPDF4LLM + RapidOCR + MarkItDown) wired in, ship the `pdf_doc_parse` variant as primary and keep `pdftotext` as an explicitly-labelled legacy fallback. Same for `pdftoppm` vs Hermes-native PNG render via `pdf_doc_parse` + `vision_analyze`.
4. **Ship pure markdown, not installers.** Per the user's stated preference — the receiving user or their Hermes can do `cp -r` + `chmod +x` in one shell block. Don't add a `install.sh` to the bundle unless explicitly asked.
5. **Always include a "What was sanitised" section in the bundle's README.** It's both an honesty signal and a useful checklist for future sanitisation runs — anything we forgot will show up by absence from that list.
6. **Bundle layout** the user expects:
   ```
   <bundle-root>/
   ├── README.md                          (overview + sanitisation notes)
   ├── SETUP.md                           (single self-contained install guide with shell block)
   ├── docs/QUICKSTART.md                 (one-page cheatsheet)
   └── research/
       ├── financial-analysis/  {SKILL.md, references/, templates/}
       ├── consumer-official-source-research/  {SKILL.md, references/}
       └── arxiv/  {SKILL.md, scripts/}
   ```
7. **Verify with grep before delivery.** Specifically look for: tickers not replaced, Telegram IDs, phone numbers, paths under `~/code` or `~/research/<specific-name>`, today's date used as an absolute reference.

The user asks for this kind of bundle on a recurring cadence (each skill gets re-shared when they get a new device, when helpers join, etc.). A clean run takes ~20 minutes; a back-and-forth with a re-pack because sanitisation missed something takes an hour.

### Verification (before reporting back)

- [ ] `~/research/<TICKER>/_manifest.json` updated with all newly fetched filings
- [ ] `sources/` contains every URL fetched, with sha256, no truncation
- [ ] Memo saved at `memos/<date>_<tag>.md` with frontmatter
- [ ] `prev_memo` and `key_deltas_vs_prev` populated (after first run)
- [ ] For multi-quarter comparison: oldest data point cited still has a `sources/` file backing it
- [ ] Nothing was re-fetched that was already in `sources/` (unless intentional drift check)
