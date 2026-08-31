---
name: india-sources
description: "Deep source map for India-regime financial analysis — primary filings (BSE/NSE/MCA/SEBI), third-party aggregators, search patterns, and what each source is best for. Hand this to a research subagent alongside the main SKILL.md."
---

# India Source Map (for subagent handoff)

Use this when running the India regime of the `financial-analysis` skill. Pair with [../SKILL.md](../SKILL.md) Part 5 for context. All sources are free unless marked **(paid)**.

## 1. Primary Filings — Start Here

### BSE (Bombay Stock Exchange)
- **Hub:** [https://www.bseindia.com/corporates](https://www.bseindia.com/corporates)
- **Quarterly Financial Results (Reg. 33):** [https://www.bseindia.com/corporates/Comp_ResultsNew](https://www.bseindia.com/corporates/Comp_ResultsNew) — search by company name or scrip code (BSE code, 5–6 digits)
- **Annual Reports (Reg. 34):** [https://www.bseindia.com/corporates/AnnualReports.aspx](https://www.bseindia.com/corporates/AnnualReports.aspx)
- **Corporate Announcements:** [https://www.bseindia.com/corporates/ann.aspx](https://www.bseindia.com/corporates/ann.aspx) — Outcome of Board Meeting, press releases, insider trading disclosures, shareholding patterns
- **Shareholding Pattern (Reg. 31):** under corporate announcements → filter by category
- **Best for:** anything BSE-listed; even NSE-primary companies have parallel BSE filings (mandatory dual listing in many cases). The BSE search interface is clunky but complete.

### NSE (National Stock Exchange)
- **Corporate Filings hub:** [https://www.nseindia.com/companies-listing/corporate-filings-intimation](https://www.nseindia.com/companies-listing/corporate-filings-intimation)
- **Annual Reports:** [https://www.nseindia.com/companies-listing/corporate-filings-annual-reports](https://www.nseindia.com/companies-listing/corporate-filings-annual-reports)
- **Compliance Calendar:** [https://www.nseindia.com/static/companies-listing/compliance-information-compliance-calendar-main-board](https://www.nseindia.com/static/companies-listing/compliance-information-compliance-calendar-main-board) — shows filing deadlines by quarter
- **Best for:** NSE-listed companies (especially Nifty 500); often has cleaner PDFs than BSE.

### MCA21 (Ministry of Corporate Affairs)
- **Portal:** [https://www.mca.gov.in/](https://www.mca.gov.in/) → MCA Services → Master Data / Document Related Services
- **Public search (no login):** [https://www.mca.gov.in/content/mca/global/en/mca/master-data.html](https://www.mca.gov.in/content/mca/global/en/mca/master-data.html) — search by CIN (Corporate Identification Number, 21-character code)
- **Documents available:** AOC-4 (financial statements), MGT-7 (annual return), board resolutions, charge documents, director changes
- **XBRL bulk data:** available via MCA → XBRL → Filings — all listed-company filings in machine-readable format since FY 2011–12
- **Best for:** official statutory record, older filings (pre-2010), verifying anything that BSE/NSE hasn't indexed yet, bulk data extraction.

### SEBI
- **Portal:** [https://www.sebi.gov.in/](https://www.sebi.gov.in/)
- **Corporate Filings:** [https://www.sebi.gov.in/curation/corporate_filings.html](https://www.sebi.gov.in/curation/corporate_filings.html) — SAST (takeover), insider trading, integrated filings
- **Regulations & Circulars:** [https://www.sebi.gov.in/legal/regulations.html](https://www.sebi.gov.in/legal/regulations.html) — primary source for LODR Reg. 33 (quarterly results), Reg. 34 (annual report), Reg. 31 (shareholding pattern)
- **BRSR Core framework:** under Legal → Circulars → 2024 (BRSR Core assurance requirements)
- **Best for:** SAST disclosures, insider trading, the rules themselves when you need to cite regulatory authority.

### Company IR Site
- **How to find:** Google `"<company name> investor relations"` or look at the footer of any corporate announcement
- **Typical contents:** Annual Report (PDF), Quarterly Results (PDF), Press Releases, Concall Transcripts, Investor Presentations, Annual Meet Recordings, ESG / Sustainability Reports
- **Best for:** cleanest PDF formatting, concall audio + transcript pair, the only place to find investor presentations in some cases. Large-caps (Reliance, TCS, Infosys, HDFC Bank, ICICI, ITC, Adani group, Tata group) post everything within hours of board approval.

## 2. Third-Party Aggregators

### Free
- **Screener.in** — [https://www.screener.in/](https://www.screener.in/) — best free aggregator for fundamentals. URL pattern: `https://www.screener.in/company/<bse-code>/consolidated/` (the `/consolidated/` is important — see Part 5 §5.3 gotcha #1). Shows 10-year P&L/BS/CF + ratios + quarterly trend.
- **Trendlyne** — [https://trendlyne.com/](https://trendlyne.com/) — strong on peer comparison, ratios, quarterly deltas. Has a BSE/NSE filings aggregator at [https://trendlyne.com/bse-corporate-announcements/](https://trendlyne.com/bse-corporate-announcements/).
- **Tickertape** — [https://www.tickertape.in/](https://www.tickertape.in/) — fundamentals + shareholder pattern visualisation.
- **MoneyControl** — [https://www.moneycontrol.com/](https://www.moneycontrol.com/) — broadest coverage (includes SME); data quality varies, double-check before relying on a number.

### Paid (institutional-grade)
- **CMIE Prowess** — [https://www.cmie.com/](https://www.cmie.com/) — the institutional standard in India; cleanest database, consistent line items across thousands of companies and decades. Subscription required.
- **CMIE Ace Equity** — cheaper Prowess alternative.
- **Capitaline** — [https://www.capitaline.com/](https://www.capitaline.com/) — detailed financial database; used widely by sell-side.
- **Bloomberg / Refinitiv / AlphaSense** — for concall transcripts with global coverage and historical depth.

## 3. Concall Transcripts

- **Company IR site** — first stop for large-caps; many post audio (MP3) + transcript (PDF). Often with a YouTube recording of the audio.
- **Trendlyne / Tickertape / Screener** — community-uploaded transcripts; partial coverage, but free.
- **AlphaSense / Refinitiv / Bloomberg** — paid, comprehensive, with full-text search across transcripts.
- **Quarterly highlights summary** — companies like Reliance, HDFC Bank, Infosys also publish 1-page quarterly highlights that condense the concall for sell-side; these are easier to scrape for keywords than full transcripts.

## 4. Search Patterns (for subagents)

When researching via web search, these patterns return the cleanest results:

| What you're looking for | Search pattern |
|---|---|
| Latest quarterly results | `"<company>" quarterly results Q4 FY25` or `"<BSE code>" site:bseindia.com` |
| Annual Report | `"<company>" annual report FY24 PDF site:<company-ir-domain>` |
| Concall transcript | `"<company>" concall transcript Q4 FY25` or `"<company>" earnings call Q4 FY25 transcript` |
| Shareholding pattern | `"<company>" shareholding pattern <quarter> site:bseindia.com` |
| Promoter pledge | `"<company>" promoter pledge <year>` |
| Insider trading | `"<company>" insider trading disclosure site:sebi.gov.in` or `site:bseindia.com` |
| Related-party transactions | `"<company>" related party transactions <year>` (Annual Report) |
| BRSR / ESG | `"<company>" BRSR <year>` |
| Management commentary | `"<company>" MD&A annual report FY24` |

**Pro tip:** when a subagent is doing the data pull, instruct it to first hit the **company IR site** for the cleanest PDFs, then fall back to BSE/NSE if IR doesn't have it, then MCA as the final fallback. Avoids parsing BSE's HTML tables when a clean PDF exists.

## 5. Document Checklist (8-quarter default scope for India)

Adapted from SKILL.md Part "Data-Gathering Checklist." Total: **13–14 documents** per company.

**Filings (8 total)**
- [ ] Annual Report — most recent FY (contains Q4 figures, full audit)
- [ ] Annual Report — prior FY
- [ ] Quarterly Financial Results — current FY Q3
- [ ] Quarterly Financial Results — current FY Q2
- [ ] Quarterly Financial Results — current FY Q1
- [ ] Quarterly Financial Results — prior FY Q3
- [ ] Quarterly Financial Results — prior FY Q2
- [ ] Quarterly Financial Results — prior FY Q1
- [ ] Shareholding Pattern (Reg. 31) — most recent quarter
- [ ] Shareholding Pattern — same quarter prior year

**Earnings call transcripts (4 total)** — same selection logic as SKILL.md
- [ ] Latest quarter call
- [ ] Prior quarter call
- [ ] Same quarter prior year (YoY tone baseline)
- [ ] One mid-range call (~3 quarters back)

**Companion documents (optional but recommended)**
- [ ] Latest earnings press release
- [ ] Latest investor presentation
- [ ] BRSR section (if applicable — top 1000 by mkt cap)
- [ ] Most recent Postal Ballot notice (if any)

**Always pull both Standalone AND Consolidated** of every financial filing. Use Consolidated for analysis; keep Standalone for parent-only debt investigations.

## 6. Pitfalls When Pulling India Data

These are the most common subagent errors:

1. **Pulling Standalone when analysis needs Consolidated.** Subagents will often grab the first PDF they find, which is usually Standalone. Always specify "Consolidated" in the search query or filter, and verify the first page of the PDF says "Consolidated" before proceeding.
2. **Calendar year / Fiscal year confusion.** Search for "Q3 FY25" explicitly, not "Q3 2024" — they overlap but mean different things.
3. **Confusing BSE code with NSE symbol.** Reliance has BSE code `500325` but NSE symbol `RELIANCE`. Search by both.
4. **Confusing the company with a same-named group entity.** "Tata Motors" (BSE 500570) ≠ "Tata Motors DVR" (BSE 570001) ≠ "TML Holdings" (different CIN). Always verify the CIN before pulling.
5. **Missing the BRSR.** Subagents may stop reading the Annual Report after the financials. For ESG-sensitive companies, you need to go deeper into the BRSR section.
6. **Over-weighting MoneyControl data.** MoneyControl ratios are sometimes computed differently (e.g., including/excluding different items). For final analysis, recompute from the source PDF.
7. **Forgetting that banks/NBFCs don't follow Part 2's SPELL framework.** See SKILL.md Part 5.5 — pull NIM, GNPA, CRAR instead of D/E, current ratio, etc.