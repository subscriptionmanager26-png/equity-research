# Relay overlay for this skill

This skill is installed as a **project skill** so Cursor Cloud Agents (Telegram/Slack automations) can load it. Personal `~/.cursor/skills/` is **not** copied to cloud VMs.

When running inside Relay:

- User-facing deliverable when a file is needed: write `artifacts/<topic>-report.md` **and** copy it to `/opt/cursor/artifacts/<topic>-report.md`. Relay only downloads the `/opt/cursor/artifacts/` copy. Short answers can stay in chat only.
- Chat reply: 1–2 sentence summary.
- PDF (`templates/build_pdf.py`) only if the user explicitly asks for a PDF.
