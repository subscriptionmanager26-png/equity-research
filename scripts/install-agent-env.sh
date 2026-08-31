#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for Relay + Telegram PDF generation.
# Safe to re-run: pip skips already-satisfied packages.
set -euo pipefail

cd "$(dirname "$0")/.."

python3 -m pip install --upgrade pip
python3 -m pip install --user -r requirements-agent.txt
python3 -c "from fpdf import FPDF; from PIL import Image; from reportlab.pdfgen import canvas; print('agent-pdf-ok')"
