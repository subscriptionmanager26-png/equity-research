#!/usr/bin/env python3
"""Screen US tax-exempt municipal bond ETFs / CEFs for Relay muni report."""
import json
import time
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf

# Curated universe: national, duration buckets, high-yield, single-state (AMT-free where noted in name)
TICKERS = [
    # National investment-grade
    "MUB", "VTEB", "ITM", "TFI", "SMB", "GMMB", "MMIN", "MMIT",
    "IBMQ", "IBMT", "IBMP", "IBMO", "IBMM",
    # Short / intermediate
    "SUB", "SHM", "VTES", "SMMU", "SMIG",
    # High yield
    "HYD", "HYMB", "FMHI", "SHYD", "XMPT",
    # Single-state
    "CMF", "PWZ", "NYF", "FMB", "FLMB", "TXF", "MIT", "MIN", "MIO", "MIS", "MIW",
    "PZA", "NCA", "RVNU", "INXX", "CXA", "MBG", "COA", "AZA",
    "EIM", "EVN", "NUV", "NQP", "BBN", "BLE", "BKN",
    "MYC", "MYD", "MYI", "MYJ", "MUA", "MUAF",
    "VTEC", "VTEI", "VTEB",
]

# Deduplicate and drop known non-muni
EXCLUDE = {"BNDX", "ISTB", "VMBS", "IHY", "VWIUX", "MEAR"}
TICKERS = sorted({t for t in TICKERS if t not in EXCLUDE})

# Manual metadata (state focus, segment) — supplements Yahoo
META = {
    "MUB": {"segment": "National IG", "state_focus": "Multi-state", "notes": "ICE AMT-free national index; ~3.5k bonds", "duration_yrs": 7.2},
    "VTEB": {"segment": "National IG", "state_focus": "Multi-state", "notes": "S&P national AMT-free; lowest fee core", "duration_yrs": 7.1},
    "ITM": {"segment": "National IG", "state_focus": "Multi-state", "notes": "Intermediate maturity national"},
    "TFI": {"segment": "National IG", "state_focus": "Multi-state", "notes": "SPDR Nuveen Bloomberg IG municipal"},
    "SMB": {"segment": "National IG", "state_focus": "Multi-state", "notes": "VanEck short IG national"},
    "SUB": {"segment": "Short IG", "state_focus": "Multi-state", "notes": "Low duration; rate-risk anchor", "duration_yrs": 2.6},
    "SHM": {"segment": "Short IG", "state_focus": "Multi-state", "notes": "SPDR Nuveen short-term national", "duration_yrs": 2.8},
    "VTES": {"segment": "Short IG", "state_focus": "Multi-state", "notes": "Vanguard short-term tax-exempt", "duration_yrs": 2.5},
    "SMMU": {"segment": "Short IG", "state_focus": "Multi-state", "notes": "PIMCO short maturity active"},
    "HYD": {"segment": "High yield", "state_focus": "Multi-state", "notes": "Below-IG muni; higher yield, more credit risk", "duration_yrs": 9.0},
    "HYMB": {"segment": "High yield", "state_focus": "Multi-state", "notes": "SPDR Nuveen Bloomberg high yield muni"},
    "FMHI": {"segment": "High yield", "state_focus": "Multi-state", "notes": "First Trust high yield muni"},
    "CMF": {"segment": "Single-state IG", "state_focus": "California", "notes": "CA residents: state + federal exempt"},
    "PWZ": {"segment": "Single-state IG", "state_focus": "California", "notes": "Invesco CA AMT-free"},
    "NYF": {"segment": "Single-state IG", "state_focus": "New York", "notes": "NY residents triple-tax edge"},
    "FMB": {"segment": "Single-state IG", "state_focus": "Multi / revenue", "notes": "Managed municipal revenue"},
    "FLMB": {"segment": "Single-state IG", "state_focus": "Florida", "notes": "FL has no state income tax; still federal-exempt"},
    "TXF": {"segment": "Single-state IG", "state_focus": "Texas", "notes": "TX no state income tax"},
    "MIT": {"segment": "Single-state IG", "state_focus": "Massachusetts", "notes": "MA heavy tech/health issuers"},
    "MIN": {"segment": "Single-state IG", "state_focus": "Minnesota", "notes": ""},
    "MIO": {"segment": "Single-state IG", "state_focus": "Ohio", "notes": ""},
    "MIS": {"segment": "Single-state IG", "state_focus": "Michigan", "notes": ""},
    "MIW": {"segment": "Single-state IG", "state_focus": "Michigan", "notes": "MI intermediate"},
    "PZA": {"segment": "National IG", "state_focus": "Multi-state", "notes": "Invesco national AMT-free; not state-specific"},
    "NCA": {"segment": "Single-state IG", "state_focus": "North Carolina", "notes": ""},
    "RVNU": {"segment": "Sector / revenue", "state_focus": "New York", "notes": "NY revenue bonds ETF"},
    "XMPT": {"segment": "CEF / HY", "state_focus": "Multi-state", "notes": "Closed-end muni fund index"},
    "EIM": {"segment": "CEF IG", "state_focus": "Multi-state", "notes": "Eaton Vance muni CEF"},
    "NUV": {"segment": "CEF IG", "state_focus": "Multi-state", "notes": "Nuveen quality muni"},
    "BBN": {"segment": "CEF IG", "state_focus": "Multi-state", "notes": "BlackRock tax-exempt"},
    "IBMQ": {"segment": "National IG", "state_focus": "Multi-state", "notes": "iShares iBonds Dec 2028 term muni"},
    "IBMT": {"segment": "National IG", "state_focus": "Multi-state", "notes": "iShares iBonds Dec 2030 term muni"},
    "IBMP": {"segment": "National IG", "state_focus": "Multi-state", "notes": "iShares iBonds Dec 2032 term muni"},
    "MMIN": {"segment": "National IG", "state_focus": "Multi-state", "notes": "IQ MacKay short muni"},
    "MMIT": {"segment": "National IG", "state_focus": "Multi-state", "notes": "IQ MacKay intermediate muni"},
    "GMMB": {"segment": "National IG", "state_focus": "Multi-state", "notes": "Goldman access muni"},
    "SMIG": {"segment": "Short IG", "state_focus": "Multi-state", "notes": "Baird short-term muni"},
    "SHYD": {"segment": "High yield", "state_focus": "Multi-state", "notes": "VanEck short high-yield muni"},
    "VTEC": {"segment": "National IG", "state_focus": "Multi-state", "notes": "Vanguard California tax-exempt"},
    "VTEI": {"segment": "National IG", "state_focus": "Multi-state", "notes": "Vanguard intermediate tax-exempt"},
}


def tax_equiv_yield(muni_yield_pct: float, fed_marginal: float = 0.32, state_marginal: float = 0.0, state_exempt: bool = False) -> float:
    """Tax-equivalent yield for taxable comparison. muni_yield_pct is e.g. 3.5 for 3.5%."""
    if muni_yield_pct is None or (isinstance(muni_yield_pct, float) and (muni_yield_pct != muni_yield_pct)):
        return None
    y = muni_yield_pct / 100.0
    if state_exempt and state_marginal > 0:
        denom = 1.0 - fed_marginal - state_marginal  # simplified; ignores deductibility
    else:
        denom = 1.0 - fed_marginal
    if denom <= 0:
        return None
    return (y / denom) * 100.0


def fetch_row(ticker: str) -> dict:
    meta = META.get(ticker, {"segment": "Municipal", "state_focus": "See prospectus", "notes": "", "duration_yrs": None})
    row = {
        "ticker": ticker,
        "segment": meta["segment"],
        "state_focus": meta["state_focus"],
        "notes": meta["notes"],
        "duration_yrs_approx": meta.get("duration_yrs"),
    }
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        hist = t.history(period="1y")
        row["name"] = info.get("longName") or info.get("shortName") or ticker
        row["category"] = info.get("category") or info.get("fundFamily") or ""
        row["expense_ratio_pct"] = info.get("annualReportExpenseRatio") or info.get("netExpenseRatio")
        if row["expense_ratio_pct"] is not None and row["expense_ratio_pct"] < 0.5:
            # yfinance sometimes returns ratio as decimal 0.0003
            if row["expense_ratio_pct"] < 0.05:
                row["expense_ratio_pct"] = row["expense_ratio_pct"] * 100
        row["yield_pct"] = info.get("yield") or info.get("dividendYield")
        if row["yield_pct"] is not None and row["yield_pct"] < 0.2:
            row["yield_pct"] = row["yield_pct"] * 100
        row["aum_usd"] = info.get("totalAssets")
        row["avg_volume"] = info.get("averageVolume") or info.get("averageVolume10days")
        row["price"] = info.get("regularMarketPrice") or info.get("previousClose")
        if len(hist) > 20:
            row["return_1y_pct"] = (hist["Close"].iloc[-1] / hist["Close"].iloc[0] - 1) * 100
        else:
            row["return_1y_pct"] = None
        row["fifty_two_week_change_pct"] = info.get("fiftyTwoWeekChange")
        if row["fifty_two_week_change_pct"] is not None:
            row["fifty_two_week_change_pct"] = row["fifty_two_week_change_pct"] * 100
    except Exception as e:
        row["error"] = str(e)
    return row


def main():
    rows = []
    for i, tk in enumerate(TICKERS):
        rows.append(fetch_row(tk))
        if i % 10 == 9:
            time.sleep(0.3)
    df = pd.DataFrame(rows)
    # Filter valid muni-ish (has name and not obvious equity)
    df = df[df["name"].notna() & ~df["name"].str.contains("error", case=False, na=False)]
    for bracket_name, fed, state in [("32% fed / 0% state", 0.32, 0.0), ("32% fed / 10% state (in-state)", 0.32, 0.10)]:
        col = f"tax_equiv_yield_{bracket_name}"
        df[col] = df["yield_pct"].apply(
            lambda y, f=fed, s=state: tax_equiv_yield(y, f, s, state_exempt=(s > 0))
        )

    # Composite score for ranking (higher better): yield, liquidity, low cost
    def score(r):
        s = 0.0
        y = r.get("yield_pct") or 0
        er = r.get("expense_ratio_pct")
        if er is None:
            er = 0.25
        vol = r.get("avg_volume") or 0
        aum = r.get("aum_usd") or 0
        s += min(y, 6) * 8  # yield cap
        s += min((aum or 0) / 1e9, 50) * 0.4  # scale AUM
        s += min((vol or 0) / 1e6, 5) * 2
        s -= er * 15
        seg = r.get("segment") or ""
        if "High yield" in seg:
            s -= 5  # penalize HY for "core" reco unless user wants yield
        if "Short" in seg:
            s += 3  # balance portfolio
        return round(s, 2)

    df["screen_score"] = df.apply(score, axis=1)
    df = df.sort_values("screen_score", ascending=False)

    out_dir = "/workspace/artifacts"
    import os
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs("/opt/cursor/artifacts", exist_ok=True)
    os.makedirs(os.path.expanduser("~/research/MUNI"), exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    xlsx_path = f"/opt/cursor/artifacts/us-tax-exempt-muni-options-{ts}.xlsx"
    xlsx_ws = f"/workspace/artifacts/us-tax-exempt-muni-options-{ts}.xlsx"

    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="All_Options", index=False)
        df.head(10).to_excel(writer, sheet_name="Top10_Screen", index=False)
        readme = pd.DataFrame(
            {
                "field": [
                    "as_of_utc",
                    "universe",
                    "tax_equiv_assumption",
                    "disclaimer",
                ],
                "value": [
                    ts,
                    "US-listed tax-exempt municipal bond ETFs/CEFs (retail-accessible wrappers). Not individual CUSIPs.",
                    "Illustrative 32% federal; add 10% state column for in-state funds",
                    "Not investment advice. Match state of residence, AMT exposure, and credit needs before buying.",
                ],
            }
        )
        readme.to_excel(writer, sheet_name="README", index=False)

    import shutil
    shutil.copy2(xlsx_path, xlsx_ws)

    manifest = {
        "updated": ts,
        "tickers_screened": len(df),
        "top10": df.head(10)["ticker"].tolist(),
    }
    with open(os.path.expanduser("~/research/MUNI/_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(df.head(15).to_string())
    print(f"\nWrote {xlsx_path}")


if __name__ == "__main__":
    main()
