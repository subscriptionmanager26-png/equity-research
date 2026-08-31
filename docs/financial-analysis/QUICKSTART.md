# Quickstart — financial-analysis skill

A condensed cheatsheet. Full methodology is in `~/.hermes/skills/research/financial-analysis/SKILL.md`.

## Trigger phrases (anything close to these will fire the skill)

- "analyse this company's financials: <TICKER>"
- "read the 10-K" / "pull the annual report"
- "interpret the earnings call"
- "spot red flags in the report"
- "check ValuePickr on <Indian name>" (India retail-forum sweep)
- "sweep Seeking Alpha on <US ticker>" (US retail-forum sweep)
- "give me a buy/hold/sell on <TICKER>"

## Two regimes — pick the right path

| | **US** (Parts 1–4) | **India** (Part 5) |
|---|---|---|
| Primary regulator | SEC | SEBI (LODR 2015) |
| Annual filing | 10-K | Annual Report (BSE/NSE + MCA AOC-4) |
| Quarterly | 10-Q | Quarterly results + investor presentation |
| Exchange filings | EDGAR | BSE + NSE + MCA21 |
| Fiscal year | Calendar (mostly) | April–March (FY26 = Apr 2025–Mar 2026) |

The skill walks you through every step: source selection → fetch → extract →
SPELL ratio analysis → DuPont decomposition → earnings-call interpretation
(prepared remarks vs Q&A, hedging language, guidance classification) → 7 red
flags → memo.

## First try — AAPL (US) or RELIANCE (India)

Both have decades of filings, free earnings-call transcripts, and active retail
discussion. Good for verifying your tooling works end-to-end.

```
"analyse AAPL financials"
"analyse Reliance Industries financials"
```

## Output location

Every analysis persists to `~/research/<TICKER>/`:

```
~/research/<TICKER>/
├── _manifest.json           ← cache manifest
├── sources/
│   ├── 10-K_FY2024.pdf
│   ├── 10-Q_Q2_FY2025.pdf
│   └── ...
├── memos/
│   └── 2026-08-28_analysis.md
└── charts/                  ← optional PDF deliverable artefacts
```

The manifest means a second run only refetches filings newer than the last run.

## When the skill is silent

If the trigger doesn't fire, Hermes may be missing the skill registration.
Verify:

```bash
ls ~/.hermes/skills/research/financial-analysis/SKILL.md
hermes skills list | grep financial-analysis
```

A restart of the Hermes gateway is the most common fix.

## See also

- `~/.hermes/skills/research/consumer-official-source-research/SKILL.md` —
  the upstream "official source first" methodology this skill follows
- `~/.hermes/skills/research/sec-edgar-extraction/SKILL.md` — XBRL puller
  for US 10-K/10-Q data
- `~/.hermes/skills/research/arxiv/` — for academic research context
