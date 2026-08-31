#!/usr/bin/env python3
"""Batch-convert a directory of PDFs to Markdown via pymupdf4llm.

Embeds the "wrong-python" probe pattern from `references/india-data-pull-recipe.md` §3d.
Doesn't assume which interpreter has pymupdf4llm — probes candidates in priority order
(Hermes runtime venv → Hermes dev venv → any project venv → PATH python3) and picks the
first that can `import pymupdf4llm`.

Usage:
    parse_pdf_dir.py <sources_dir> [--python PATH] [--force]

Examples:
    # Auto-discover python
    parse_pdf_dir.py ~/research/<TICKER>/sources

    # Force a specific interpreter (skip probe)
    parse_pdf_dir.py ~/research/<TICKER>/sources \\
        --python /home/pi/.hermes/hermes-agent/venv/bin/python

    # Overwrite existing .md files (default: skip)
    parse_pdf_dir.py ~/research/<TICKER>/sources --force

Output:
    Writes one `<pdf-stem>.md` per `<pdf-stem>.pdf` in the input directory.
    Progress on stderr. Single-line summary on stdout (counts + interpreter used).

Compatible with: Python 3.10+ on any host with pymupdf4llm installed.
Hermes canonical setup: pymupdf4llm pre-installed in
    /home/pi/.hermes/hermes-agent/venv/ (the `hermes` CLI's venv).
System `/usr/bin/python3` (Debian-derived, 3.13) is PEP 668 and does NOT have it.
"""
from __future__ import annotations
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# --- Interpreter discovery -----------------------------------------------------

def _can_import(python: Path, module: str = "pymupdf4llm") -> tuple[bool, str]:
    """Run `python -c "import <module>"` and return (ok, version_or_err)."""
    try:
        r = subprocess.run(
            [str(python), "-c", f"import {module}; print({module}.__version__)"],
            capture_output=True, text=True, timeout=15,
        )
        if r.returncode == 0:
            return True, r.stdout.strip()
        return False, (r.stderr.strip() or "import failed")
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return False, f"{type(e).__name__}: {e}"


def _candidate_pythons() -> list[Path]:
    """Probe order mirrors §3d. First hit wins."""
    homes = [Path("/home/pi"), Path.home()] if Path("/home/pi").exists() else [Path.home()]
    venv_roots: list[Path] = []
    for h in homes:
        for sub in [
            ".hermes/hermes-agent/venv",
            ".hermes/hermes-agent/.venv",
            ".venvs",
            ".virtualenvs",
            ".venv",
            "venv",
        ]:
            venv_roots.append(h / sub)

    candidates: list[Path] = []
    for root in venv_roots:
        if not root.exists():
            continue
        if root.is_dir():
            # direct venv
            cand = root / "bin" / "python"
            if cand.exists():
                candidates.append(cand)
            # nested venvs (e.g. ~/.venvs/<name>/bin/python)
            for child in root.iterdir():
                if child.is_dir() and (child / "bin" / "python").exists():
                    candidates.append(child / "bin" / "python")

    # PATH python3 as the last resort
    which = shutil.which("python3")
    if which:
        candidates.append(Path(which))

    # Dedup, preserve order
    seen: set[str] = set()
    out: list[Path] = []
    for c in candidates:
        key = str(c.resolve())
        if key not in seen:
            seen.add(key)
            out.append(c)
    return out


def pick_python(explicit: str | None) -> tuple[Path, str]:
    """Return (python_path, version_string). Exits if none work."""
    if explicit:
        p = Path(explicit)
        ok, ver = _can_import(p)
        if not ok:
            print(f"FATAL: --python {explicit} cannot import pymupdf4llm:\n  {ver}",
                  file=sys.stderr)
            sys.exit(2)
        return p, ver

    for cand in _candidate_pythons():
        ok, ver = _can_import(cand)
        if ok:
            return cand, ver

    print(
        "FATAL: no interpreter probed could import pymupdf4llm.\n"
        "Tried:\n  " + "\n  ".join(str(c) for c in _candidate_pythons()) + "\n\n"
        "Options:\n"
        "  1. Install: uv pip install --python <path-to-python> pymupdf4llm\n"
        "  2. Use the Hermes-native pdf_doc_parse tool from a session instead.\n"
        "  3. Force a python that you know works: --python /full/path/to/python",
        file=sys.stderr,
    )
    sys.exit(2)


# --- Conversion ----------------------------------------------------------------

CONVERT_SNIPPET = r"""
import sys, pathlib
import pymupdf4llm

src_dir = pathlib.Path(sys.argv[1])
out_dir = pathlib.Path(sys.argv[2])
force   = sys.argv[3] == "1"

ok, skip, fail = 0, 0, 0
for pdf in sorted(src_dir.glob("*.pdf")):
    out = out_dir / f"{pdf.stem}.md"
    if out.exists() and not force:
        skip += 1
        continue
    try:
        md = pymupdf4llm.to_markdown(str(pdf))
        out.write_text(md)
        ok += 1
        print(f"  ✓ {pdf.name} → {out.name} ({len(md)/1024:.0f} KB md)",
              file=sys.stderr)
    except Exception as e:
        fail += 1
        print(f"  ✗ {pdf.name}: {type(e).__name__}: {e}", file=sys.stderr)

print(f"{ok} converted, {skip} skipped, {fail} failed")
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sources_dir", type=Path,
                    help="Directory containing *.pdf files. Output .md files are written here too.")
    ap.add_argument("--python", metavar="PATH",
                    help="Skip probe; force this interpreter (must have pymupdf4llm importable).")
    ap.add_argument("--force", action="store_true",
                    help="Overwrite existing .md files (default: skip if present).")
    args = ap.parse_args()

    src: Path = args.sources_dir.expanduser().resolve()
    if not src.is_dir():
        print(f"FATAL: {src} is not a directory", file=sys.stderr)
        return 2

    py, ver = pick_python(args.python)
    # We invoke the chosen interpreter as a subprocess so the agent's own Python
    # doesn't matter — only the target's pymupdf4llm does.
    rc = subprocess.run(
        [str(py), "-c", CONVERT_SNIPPET, str(src), str(src),
         "1" if args.force else "0"],
    ).returncode
    if rc != 0:
        return rc

    print(f"\n✓ Done. Interpreter: {py} (pymupdf4llm {ver})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
