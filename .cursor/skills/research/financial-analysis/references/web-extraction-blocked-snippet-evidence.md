---
title: "When full-page extraction is blocked, use search snippets as first-class evidence"
description: "Cloudflare/Akamai/anti-bot sites often return only the OP and search-engine snippet indexes the rest. Capture both with proper attribution."
version: 1.0.0
---

# Using search snippets as first-class evidence when `web_extract` is blocked

## When to use this

You're running a financial-analysis sweep (Part 5.9 India retail forum, Part 7 US retail forum, or just a transcript/source fetch) and one of these patterns shows up:

- `web_extract` returns only the opening post / original post of a forum thread (Technofino, ValuePickr, r/ValueInvesting, etc.)
- `web_extract` returns `{"error": "TinyFish fetch failed: read operation timed out"}` or 403 (Cloudflare block — Technofino, some IR sites)
- The site returns a JS challenge page ("Prove your humanity", "Just a moment…")
- The site is a low-traffic / niche venue that the search engine indexed but that blocks programmatic fetch (common for Indian retail-investment forums and smaller US Substacks)

In all four cases, the search-engine snippet index usually has the substantive content (replies, quoted passages, named arguments). Don't treat the failure as a missing signal — treat it as a different access pattern.

## The recipe

1. **Run `web_search` with `site:<domain>`** — even if `web_extract` failed, the search backend usually has snippets of the same page indexed. Search results carry the title, URL, and ~150-300 chars of descriptive snippet per hit.
2. **For each top result, capture both**:
   - The `url` (for the memo's source list — always include the URL even if you couldn't read the page in full)
   - The `description` snippet (which is what the search engine extracted from the page; usually a relevant paragraph)
3. **Compose the memo from snippets**, not from summaries you paraphrase. Each bullet should be either:
   - A direct quote from a snippet (use `>` blockquote, attribute to the URL/author)
   - A summary of what the snippets collectively indicate (e.g., "Forum consensus across 6 search snippets: [bull thesis with 1 supporting quote + 1 counter-argument quote]")
4. **Flag the source-quality downgrade** explicitly in the memo's "Verification" or "Gated posts not pulled" line: "web_extract blocked by Cloudflare (HTTP 403); snippets from web_search used as evidence. Quote attribution may be approximate."

## Worked example: Technofino "Credit card for tax payment in 2026" thread (Aug 2026)

- **Direct fetch:** `web_extract` returned only the OP (sbatra, 25L capital gains tax question + stack list). 403 on the thread page.
- **What worked:** `web_search` returned 5+ snippets for the same thread URL, each containing different reply content:
  - Snippet from a reply: "2% returns; so you can pay for 9 months (say from July 26 onwards) i.e. Rs 9L from this card and get approx. 2% returns i.e. Rs 18K..."
  - Snippet from another reply: "Yes Bank Marquee gives 1.25% reward rate. Tax payments starting Feb 2025..."
  - Snippet from a third: "IDFC Wealth is running an offer of 2X reward points on tax payments..."
- **Result:** The full thread analysis (IDFC Wealth + Yes Bank + SCB + HDFC Diners Black debate) was reconstructed from snippets alone, with attribution to the thread URL rather than to individual reply URLs. The memo flagged: "web_extract blocked (Cloudflare 403); reply content sourced from web_search snippets."

## Worked example: HSBC Premier Tax Rewards thread (Aug 2026)

- **Direct fetch:** Cloudflare 403.
- **Snippet recovery:** Got the full OP body via the search snippet (which is unusually long because the OP is a detailed calculation). The thread only had the OP + a few short replies — snippet coverage was sufficient.
- **Result:** Reconstructed the entire argument (3% reward capped at ₹1L/mo = max ₹3K/mo, vs opportunity cost of ₹1L/yr on ₹50L @ 5.3% vs 7.25%) from one snippet. Quoted the OP verbatim, attributed to the thread URL.

## When snippets are NOT sufficient

Don't try to reconstruct from snippets when:

- The thread has 50+ replies and you need a sentiment distribution (snippets only cover what the search engine deemed "relevant" — usually top replies and any reply containing the search query terms; middle-of-thread replies are underrepresented)
- The discussion is heavily visual (chart screenshots, embedded spreadsheets) — snippets don't capture images
- The site's content is behind a login wall (Cloudflare-protected gated posts on ValuePickr, Substack paywalls) — the search engine can't index gated content, so snippets return empty
- You need exact figures, not paraphrased ones (e.g., specific YoY growth percentages from a 10-Q) — snippets sometimes round or omit numbers

In those cases, fall back to:
- `browser_exec` (browser_navigate) — handles JS challenges but is slower
- `web_extract` with `char_limit=8000` — sometimes smaller payloads bypass rate limits
- `web_search` on the **same domain with different terms** — different snippets surface different content
- Archive.org Wayback Machine — for cached versions of pages that are now blocked

## Cross-reference: web-extract-retry-before-curl skill

This references complements `~/.hermes/skills/devops/web-extract-retry-before-curl/SKILL.md`. That skill covers "when `web_extract` times out, retry before falling back to curl." This file covers "when `web_extract` returns only partial content because of an anti-bot block, use the search-snippet side-channel as the primary evidence source." Different failure modes, different recovery strategies.

## Pitfall

- **Don't synthesize content you didn't actually see.** Snippets are real evidence. Paraphrasing what you think the page "probably says based on the title" is fabrication. If you only have the page title + URL but no snippet content, say so in the memo: "thread URL captured, content not pulled — Cloudflare block on direct fetch, no snippet coverage for this reply".
- **Always cite the thread URL, not the snippet URL.** Search snippets don't have stable per-reply URLs on forums like ValuePickr / Technofino / Reddit (the reply permalink may or may not work). Cite the thread URL and note which snippets supported which claim.
- **Snippet coverage is biased toward recent replies.** Search engines re-crawl forums and tend to index recent + frequently-upvoted content. Old replies, niche counter-arguments, and posts by low-karma users are under-represented. Flag this in the memo when conviction trend analysis is the point.
