# Buy / Hold / Sell Recommendation Framework (PT + Scenario)

Companion to `india-data-pull-recipe.md` — same <TICKER> origin (1 Jul 2026). Use this when the user asks for **a defensible actionable call** (target price + horizon + bull/base/bear) instead of just "is it cheap or expensive?".

The skill's `Output Template` covers the *description* side (numbers, ratios, red flags, tone). This file covers the *prescription* side (what to do with it). They compose: run the analysis first using the SKILL.md Output Template, then layer the recommendation on top using this template.

## When to use

- User says "**buy / hold / sell**," "give me a **call**," "what would you do," or "**target price**."
- User asks "is the stock **expensive**?" — same answer; needs PT-vs-price comparison.
- **Don't use** for casual portfolio reviews ("what's your view on Infosys?") where a 2-sentence opinion is fine. Quick views stay free-form; this template is for taking a real position.

## Defaults (locked July 2026)

These are the floor settings for the Indian mid/small-cap universe the user operates in. Override only on explicit user request.

| Input | Default | Why |
|---|---|---|
| **Time horizon** | 12 months | User explicit choice (1 Jul 2026). For project-driven companies with >3 yr execution cycles, also report 24m PT alongside. |
| **Methods blended** | DCF 30% + Peer multiples 50% + RIM 20% | Multiples get the most weight — for Indian mid-caps, peer-anchored multiples are the most defensible in front of any audit/peer review. DCF + RIM are sanity checks. |
| **WACC (DCF)** | 12.5% | India 10Y G-sec 7.0% (FY26 average) + ERP 6.0% × beta 1.2 + illiquidity premium 0.5% = ~12.5%. Override to 10.5% for very large caps (>₹50,000 cr), 14% for micro-caps. |
| **Terminal growth** | 5.0% | Nominal, in INR. Equals long-run India nominal GDP. Override 3.5–4% for cyclical/defence-pure plays; 6% for clean-energy plays. |
| **DCF explicit period** | 5 years (FY27E–FY31E) | Captures management's stated visibility window (order book + nuclear roadmap + AI customer ramp + capex build). |
| **Tax rate (DCF/RIM)** | 25.17% (Section 115BAA effective) | Verify the company has opted into the concessional regime; if not, use 30% + 4% cess ≈ 31.2%. |
| **Scenario haircut on management guide** | Bear –70% / Base –50% / Bull +10% | Bear = severe execution miss; base = conservative interpretation; bull = full delivery. Adjust for company-specific credibility (track record of beating/raising guidance). |
| **Action labels** | **Buy** = PT ≥ +20% upside over 12m, **Hold** = PT ±20% of current, **Sell** = PT ≤ -20% | Standard institutional framing. |
| **Position size bands** | Buy conviction Core (≥+30% PT, low red flags) / Growth (+20-30% PT) / Watchlist (<+20% PT, positive narrative); Hold at fair value ±10%; Reduce/Exit at -10% to -20%; Sell at <-20% PT or thesis break | Maps to a multi-bucket portfolio. |
| **Peer set minimum** | At least 5 peers, including 1 large cap (anchor), 2 mid caps (comparables), 1-2 small caps (growth peers) | Multiples anchored to mix, not single comp. **Defensibility rule:** default the multiples anchor to large-cap + mid-cap PSU defence peers (e.g. HAL + BEL), report full peer-group median as cross-check only. See Method 2 pitfalls. |

## Pre-flight (compute before drafting the memo)

The thesis memo already produces most of this. Re-confirm:

- [ ] Current price, 52-week range, TTM/Forward P/E, P/B, market cap, free float, FII holding direction
- [ ] Rev, EBITDA, PAT, FCF, CFO/NI for the most recent FY (audited) + most recent quarter (concurring quarter management commentary)
- [ ] WC days trajectory over last 4 quarters
- [ ] Order book (if project-driven) + book-to-bill
- [ ] Promoter pledge + FII flow direction (last 3 quarters)
- [ ] Red-flag score (7-point check)

Then build **three projections**: FY27E, FY28E, FY29E — conservative (base case), bear (stress), bull (credible upside). All three use the **same** macro inputs (WACC, terminal growth) but **different** operating assumptions.

## Three methods (compute each, then blend)

### Method 1 — DCF (30% weight in blend)

1. Project 5 years of unlevered FCF using the base-case revenue ramp.
2. Compute WACC per the defaults above.
3. Terminal value = `FY31E FCF × (1 + g) / (WACC − g)`. Validate g < WACC.
4. Discount everything to mid-year-of-first-year-FCF basis (mid-year convention is standard for India mid-caps).
5. EV = sum(PV of FCF + terminal). Subtract net debt → equity value. Divide by share count → fair value/share.
6. **Repeat** for bear (lower revenue, lower EBITDA margin, slower WC release) and bull (faster execution, higher EBITDA margin via operating leverage).

Pitfalls:
- Don't use CFO as a proxy for FCF for project-driven companies — CFO can be wildly positive or negative during ramp. Use `EBIT × (1 − tax) + D&A − ΔWC − CapEx`.
- For <Company> specifically, capex is a step-up (₹250-300 cr over 2 years); bake this into base/bear/bull FCF, don't smooth it out.
- DCF is structurally less credible at 12 months (terminal value dominates); treat the DCF PT as a **sanity check**, not the lead number. That's why multiples get 50%.

### Method 2 — Peer multiples (50% weight in blend)

1. Pick 5–7 peers (default rule above).
2. Pull each peer's TTM EV/EBITDA, forward EV/EBITDA, and Forward P/E from Trendlyne / StockAnalysis / Screener.
3. Drop outliers (>2× median). Compute trimmed mean and median.
4. Apply trimmed mean **forward EV/EBITDA × FY28E EBITDA** to get target EV. Adjust for net debt → equity value.
5. Apply trimmed mean **forward P/E × FY27E EPS** as a cross-check.
6. For project-driven companies where margin expansion is the story, prefer EV/EBITDA over P/E (P/E double-counts the depreciation step-up from capex). For asset-light companies (software, services), prefer P/E.

Pitfalls:
- Don't average P/E and EV/EBITDA equally for mid-caps — pick the method most relevant to the business model and weight others as cross-checks.
- For Indian mid-caps, peer multiples **inflate** in narrative-driven reratings. Use **3-year average peer multiple** (drop the current peak) for a more defensible anchor. Document this clearly in the memo.
- **Default peer anchor: HAL/BEL only (defensible PSU defence comps), not the full peer-group median.** Of a typical 5–7 Indian mid-cap defence/clean-energy peer set, 4–5 will themselves be in narrative-driven rerating mode (e.g. BDL at ~119× Fwd P/E, PARAS at ~118×). Anchoring to the full-group median (~74× Fwd P/E) bakes in inflated multiples. **Default anchor: large-cap PSU defence peer (HAL ~30× Fwd P/E) + mid-cap PSU defence peer (BEL ~43× Fwd P/E)**. Trimmed mean of these two ~35–37× is the defensible base. Report the full-group median as a cross-check, not the lead number. The <Company> 2026-07-01 run showed this swing: defensible anchor gave base PT ₹1,425 (–81% vs current); full median gave ₹4,773 (–37%). Always show both in the memo.
- **Recheck** with at least one peer in same sub-vertical (e.g., for <Company>'s Bloom-customer concentration, anchor to **Bloom Energy** itself as a US-listed comp — same customer, reverse side of the trade).

### Method 3 — Residual Income Model (20% weight in blend)

RIM = `BVPS₀ + Σ (ROE − r) × BVPS / (1 + r)^t`, where r = cost of equity (CAPE).

Use it as a third anchor — RIM is structurally well-suited to companies with negative or near-zero near-term FCF and large equity value (which describes project-driven Indian mid-caps reasonably well).

Steps:
1. Pull book value/share from latest audited BS (FY25 for <Company>).
2. Project FY27E–FY31E book value using retained earnings (FY1E EPS × retention).
3. Compute ROE for each year.
4. Cost of equity = CAPE for Indian mid-caps ≈ 13.5% in FY26 (10Y G-sec 7% × 1 + 6% ERP). Higher than WACC (no debt benefit).
5. Residual income = (ROE − r) × beginning BV. Discount.
6. Sum to fair value/share. Cross-check against DCF and multiples — if RIM is the lowest, the company is **structurally over-earning** (potential mean-reversion risk).

Pitfalls:
- RIM is accounting-based, so it's sensitive to one-off items (FX gains, exceptional items). Adjust FY26 PAT for ~₹25 cr FX gain before using as base year.
- Don't overweight RIM for asset-heavy companies — DCF and multiples are better there.

### Blend

`PT_blend = 0.30 × PT_DCF + 0.50 × PT_multiples + 0.20 × PT_RIM`

If any method gives a PT more than 2× the blend, **flag it as "method outlier"** in the memo and document why (e.g., "RIM inflated by FY26 FX gain — base-year adjustment shown in §6"). The user / audit should see the divergence, not just the blended number.

## Bull / Base / Bear PT table (mandatory output)

| Scenario | Revenue FY27E (₹ cr) | EBITDA mgn FY27E | PAT FY27E (₹ cr) | PT (₹) | Upside vs current | Probability (your estimate) |
|---|---:|---:|---:|---:|---:|---:|
| **Bear** | [X] | [%] | [Y] | [P_bear] | [-Z%] | [p%] |
| **Base** | [X] | [%] | [Y] | [P_base] | [+Z%] | [p%] |
| **Bull** | [X] | [%] | [Y] | [P_bull] | [+Z%] | [p%] |
| **Probability-weighted** | – | – | – | `Σ PT_i × p_i` | [%] | 100% |

**Probability-weighted PT is the actionable number**, not the base case. Reasonable defaults: p_base = 50-60%, p_bull = 20-30%, p_bear = 15-25% (asymmetry reflects both upside optionality and execution risk).

## Action rubric (final output)

```
ACTION: [BUY / HOLD / SELL]
CONVICTION: [High / Medium / Low]
HORIZON: 12 months

ENTRY ZONE:     ₹[X] – ₹[Y]  (current: ₹[Z])
PT (12m base):  ₹[P_base]   [+/-%]
PT (12m bull):  ₹[P_bull]   [+/-%]
PT (12m bear):  ₹[P_bear]   [+/-%]
PROB-WT PT:     ₹[P_probwt] [+/-%]

RECOMMENDED SIZE: [full position / half / starter / hold-til-confirm / trim / exit]
    based on: PT upside, conviction, red-flag count, sector liquidity, position in user's book
TIME-DECAY NOTES:
    - What would change to upgrade/downgrade
    - Specific catalysts for next 4 quarters
```

**Action labels are intentionally tight**: Buy / Hold / Sell (no "Accumulate"). The user has indicated they prefer clarity over hedging.

## What goes into the memo (extra sections beyond the standard Output Template)

When producing a buy/hold/sell memo, add these after the standard 10 sections:

### Section 11 — Valuation Framework

Show the blended PT table above + the 3-method outputs in 3 mini-tables (DCF, multiples, RIM). Document every input (WACC, growth rates, peer-multiple anchors, RIM cost of equity). **Audit trail is the point** — anyone should be able to recompute from the memo.

### Section 12 — Scenario Logic

For each scenario, document:
- What assumption flips vs base
- Why this scenario is plausible (cite a recent event, an analyst's warning, a regulatory change)
- What would invalidate the scenario

### Section 13 — Catalysts (next 4 quarters)

Calendar of binary events:
- Q1FY27 result (early Aug 2026) — first read on FY27 ramp
- Bloom Energy's quarterly capex update
- Calandria/End Shield first order (NPCIL tender)
- Oil & gas plant commissioning (Sept 2026)
- Order inflow announcements (these move the stock 5-10% on day)

### Section 14 — Position Sizing Notes

For the user's portfolio, which I don't have full context on (size, sector exposure, etc.):
- Note suggested size as % of book
- Note sector concentration risk (multiple holdings in same sector)
- Note liquidity risk (avg daily volume × days to liquidate)

### Section 15 — When To Sell (every BUY/ADD has an exit)

Often forgotten. Document:
- Stop-loss trigger (% from entry, or specific event)
- Thesis-break triggers (named catalysts or numbers)
- Re-rating lock-in triggers (when to take profits even on a winning position)

## Pitfalls (worth re-reading before any call)

1. **Don't let management's narrative anchor the bull case uncritically.** Bear-case should be a real bear, not "the bear case if everything goes slightly wrong." Stress-test against a public blow-up comp (e.g., a defence PSU that missed a 5-year plan by 40%).
2. **Don't blend a base-case DCF with a bull-case multiples PT** — that bakes in optimistic bias by construction. Each method's 3 scenarios should be internally consistent.
3. **Currency and inflation assumptions matter for India mid-caps.** Lock the macro inputs (WACC, terminal growth, USD/INR path) at start of analysis; don't drift mid-memo.
4. **Forward-looking statements in the IR site should be discounted.** A "₹5,000 cr FY30" target is a 4-year-out target with substantial execution risk — apply bear case haircut, don't take management's number at face.
5. **Don't produce a price target without a horizon** — "₹9,000 by Dec 2026" is a fundamentally different signal from "₹9,000 by Dec 2028" even when both correctly imply a similar IRR.
6. **Don't go silent on liquidity.** If avg daily volume is 0.5% of free float, a 2% book position is 4 trading days to exit. Indian mid-caps can have thin books.
7. **Don't conflate "the company is great" with "the stock is a buy."** Quality + price = return. A great company at 2× fair value is a sell (for new positions) or a hold (for existing holders).
8. **Always publish the disconfirming case.** "Why this is wrong" must be in the memo, in the user's voice, before "this is what I'd do." It builds calibration.

## Time budget (<Company> specifically, 12-month PT)

| Step | Time | Output |
|---|---|---|
| Pull peer-comp data (7 peers TTM P&L + multiples) | 30-45 min | `peer_comp_2026-07-01.json` |
| FY27E/FY28E/FY29E base-case P&L model | 30 min | Spreadsheet or inline tables |
| DCF (3 scenarios) | 30 min | 3 PTs |
| Peer-multiples PT (3 scenarios) | 30 min | 3 PTs |
| RIM (3 scenarios) | 30 min | 3 PTs |
| Blend, validate, write reco memo | 60 min | `memos/2026-07-01_reco.md` |
| **Total** | **~3.5 hours** | Full thesis + PTs + action |

This is the right cost for a position-sized hold/buy decision. Don't shortcut it for a small starter position either — the same audit logic applies.

## Worked example: <Company> (1 Jul 2026)

Saved separately as `~/research/<TICKER>/memos/2026-07-01_reco.md` after the framework is built. Use that as the reference for what good looks like.

## Related skills

- `financial-analysis/SKILL.md` — the upstream skill (three-statement, SPELL, earnings call, 7 red flags)
- `financial-analysis/references/india-data-pull-recipe.md` — the data-pull mechanics
- `consumer-product-research` — for sector-level competitive context (useful as cross-check before doing peer comps)
