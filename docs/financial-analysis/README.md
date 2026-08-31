# Financial Analysis Skill Bundle

A single-skill bundle containing the **financial-analysis** skill for Hermes Agent
— a workflow for analyzing public companies through their filings (10-K/10-Q/annual
report) and quarterly earnings conference calls, with parallel regimes for **US**
(SEC/EDGAR) and **India** (BSE/NSE/MCA, SEBI LODR, FY Apr–Mar).

## What's in the bundle

```
financial-analysis-bundle/
├── README.md                      ← this file
├── SETUP.md                       ← step-by-step install + troubleshooting
├── docs/
│   └── QUICKSTART.md              ← one-page cheatsheet
├── install.sh                     ← one-shot installer
└── research/
    └── financial-analysis/
        ├── SKILL.md
        ├── references/
        │   ├── india-data-pull-recipe.md
        │   ├── india-sources.md
        │   ├── pdf-deliverable-from-analysis.md
        │   ├── thesis-memo-reco-template.md
        │   └── web-extraction-blocked-snippet-evidence.md
        ├── scripts/
        │   └── parse_pdf_dir.py
        └── templates/
            ├── build_pdf.py
            └── credit_card_issuer_charts.py
```

## Trigger phrases

- "analyse this company's financials: <TICKER>"
- "read the 10-K"
- "interpret the earnings call"
- "spot red flags in the report"
- "check ValuePickr on <Indian name>"
- "sweep Seeking Alpha on <US ticker>"
- "give me a buy/hold/sell on <TICKER>"

## What was sanitised

The originals on the source machine contained worked-example references that
linked the skill to specific companies the source author had analysed. These have
been generalised to placeholders:

- ❌ Source-specific tickers (MTARTECH, NTNX, SBICARD, AMR, AXP) replaced with `<TICKER>`
- ❌ Source-specific company names (MTAR Technologies, Nutanix, SBI Card, etc.) replaced with `<Company>`
- ❌ Source-specific paths in worked examples generalised
- ✅ Kept: public-ticker first-try examples (AAPL, MSFT, RELIANCE, TCS) — these
  are documented in the skill's own QUICKSTART as the recommended first analysis
- ✅ Kept: CIK numbers, order-book figures, EPS unit conversions, SPELL ratio
  thresholds, and all numerical patterns that teach the methodology
- ✅ Kept: source URLs to public regulatory sites (SEC EDGAR, BSE, NSE, MCA,
  company IR sites) — these are public regulatory endpoints, not source-specific

## Quick install

```bash
# Standard install — drops the skill under ~/.hermes/skills/research/
./install.sh

# Or customise the target
HERMES_SKILLS_DIR=/path/to/skills ./install.sh

# Uninstall
./install.sh --uninstall
```

Markdown-only install (no script execution — paste the cp commands from SETUP.md)
is equally supported if you'd rather not run a downloaded script.

## Dependencies

**Required:** none — the skill itself is pure markdown and auto-loads.

**Optional:**
- `python3` — only needed when you invoke the bundled helper scripts
  (`scripts/parse_pdf_dir.py`) or templates (`templates/build_pdf.py`,
  `templates/credit_card_issuer_charts.py`).
- `pymupdf4llm` or `pdfplumber` — for the PDF parsing workflow.
- `fpdf2` — for generating the bundled PDF deliverable template.

The install script does not install Python packages; install them only when you
hit the workflow that needs them. See SETUP.md for details.

## Version

Source skill version: **1.11.0**. Bundle re-verified 2026-08-28.
