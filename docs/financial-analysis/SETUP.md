# Setup — financial-analysis skill bundle

## 1. Prerequisites

- Hermes Agent installed and `~/.hermes/skills/` exists.
- A registered web backend (e.g. `tinyfish` in `~/.hermes/config.yaml`) — required
  for `web_search` / `web_extract` against JS-rendered or anti-bot sources (BSE,
  NSE, MCA behind Akamai). Without a configured backend, SEC EDGAR R-files and
  arxiv still work via plain `curl`. Check:
  ```bash
  grep -A 3 "^web:" ~/.hermes/config.yaml
  ```
- Optional Python deps — only when you trigger PDF / chart workflows:
  ```bash
  python3 -c "import pymupdf4llm, fpdf, matplotlib" 2>&1 || echo "missing optional deps"
  pip install --user pymupdf4llm fpdf2 matplotlib
  ```

## 2. Install

**Scripted (recommended):**

```bash
cd financial-analysis-bundle
./install.sh
# → drops research/financial-analysis/ under ~/.hermes/skills/
```

**Manual (markdown-only, no script execution):**

```bash
HERMES_SKILLS_DIR=$HOME/.hermes/skills
BUNDLE_DIR=/path/to/financial-analysis-bundle

mkdir -p "$HERMES_SKILLS_DIR/research"
cp -r "$BUNDLE_DIR/research/financial-analysis" "$HERMES_SKILLS_DIR/research/"

# Make helper scripts executable (optional — only needed if you'll run them directly)
[ -f "$HERMES_SKILLS_DIR/research/financial-analysis/scripts/parse_pdf_dir.py" ] && \
  chmod +x "$HERMES_SKILLS_DIR/research/financial-analysis/scripts/parse_pdf_dir.py"
```

## 3. Verify

```bash
ls ~/.hermes/skills/research/financial-analysis/
# → SKILL.md  references/  scripts/  templates/

# Make sure Hermes picks it up
hermes skills list | grep financial-analysis
# or in-session:
#   skills_list   # in a running Hermes session
```

Restart any running Hermes gateway so it rescans the skills directory.

## 4. First run

Try a public ticker with abundant free data:

```
"analyse this company's financials: AAPL"
```

or for the India path:

```
"analyse MTAR Technologies financials"
# (the skill will route through the BSE/NSE/MCA workflow in Part 5)
```

The skill persists every analysis to `~/research/<TICKER>/` with a manifest
(`_manifest.json`) so subsequent runs only refetch new filings.

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Skill doesn't show in `skills_list` | Hermes hasn't rescanned | Restart the gateway / start a new session |
| `web_search` returns nothing | No web backend configured | `pip install` tinyfish plugin OR `grep web ~/.hermes/config.yaml` |
| `curl https://www.sec.gov/...` returns 403 | Missing `User-Agent: <name> <email>` header | The skill documents the correct header — copy it |
| BSE/NSE filings return empty | Akamai blocking bare `curl` | Use a configured web backend (`tinyfish`) |
| `parse_pdf_dir.py` errors with `ModuleNotFoundError: pymupdf4llm` | Optional dep missing | `pip install --user pymupdf4llm` |
| `build_pdf.py` errors with font lookup failure | DejaVu fonts not installed in `/usr/share/fonts/...` | The skill probes 11 common paths and emits a fix prompt on failure |

## 6. Uninstall

**Scripted:**

```bash
cd financial-analysis-bundle
./install.sh --uninstall
```

**Manual:**

```bash
rm -rf ~/.hermes/skills/research/financial-analysis
```

Note: this only removes the **skill files**. Any analysis output you produced
under `~/research/<TICKER>/` is untouched (delete those manually if you want a
full clean-up).
