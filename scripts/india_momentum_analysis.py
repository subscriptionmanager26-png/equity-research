#!/usr/bin/env python3
"""India momentum ETF + index fund comparison (2Y window, Sep 2024–Aug 2026)."""

import json
import math
import urllib.request
from datetime import datetime
from statistics import mean, stdev

# Direct Growth / ETF scheme codes (MFAPI)
PRODUCTS = {
    # Nifty 200 Momentum 30 — ETFs
    "Motilal N200 Momentum 30 ETF": {"code": 149801, "type": "ETF", "index": "Nifty 200 Momentum 30"},
    "HDFC N200 Momentum 30 ETF": {"code": 150657, "type": "ETF", "index": "Nifty 200 Momentum 30"},
    "ICICI N200 Momentum 30 ETF": {"code": 150455, "type": "ETF", "index": "Nifty 200 Momentum 30"},
    "ABSL N200 Momentum 30 ETF": {"code": 150498, "type": "ETF", "index": "Nifty 200 Momentum 30"},
    "Kotak N200 Momentum 30 ETF": {"code": 153904, "type": "ETF", "index": "Nifty 200 Momentum 30"},
    # Nifty 200 Momentum 30 — Index funds
    "UTI N200 Momentum 30 Index": {"code": 148703, "type": "Index Fund", "index": "Nifty 200 Momentum 30"},
    "Motilal N200 Momentum 30 Index": {"code": 149800, "type": "Index Fund", "index": "Nifty 200 Momentum 30"},
    "ICICI N200 Momentum 30 Index": {"code": 150452, "type": "Index Fund", "index": "Nifty 200 Momentum 30"},
    "Kotak N200 Momentum 30 Index": {"code": 151781, "type": "Index Fund", "index": "Nifty 200 Momentum 30"},
    "Bandhan N200 Momentum 30 Index": {"code": 150591, "type": "Index Fund", "index": "Nifty 200 Momentum 30"},
    # Nifty Midcap 150 Momentum 50 — Index funds (2y+; no ETF qualifies yet except Motilal ~14mo)
    "Tata Midcap150 Momentum 50 Index": {"code": 150738, "type": "Index Fund", "index": "Nifty Midcap 150 Momentum 50"},
    "Edelweiss Midcap150 Momentum 50 Index": {"code": 150902, "type": "Index Fund", "index": "Nifty Midcap 150 Momentum 50"},
    "Kotak Midcap150 Momentum 50 Index": {"code": 152916, "type": "Index Fund", "index": "Nifty Midcap 150 Momentum 50"},
    # Mid/small-cap momentum quality ETFs
    "Mirae MidSmall MQ 100 ETF": {"code": 152634, "type": "ETF", "index": "Nifty MidSmallcap400 MQ 100"},
    "Mirae Smallcap 250 MQ 100 ETF": {"code": 152455, "type": "ETF", "index": "Nifty Smallcap 250 MQ 100"},
}

BENCHMARKS = {
    "Nifty 50 (Jensen benchmark)": 118482,  # Bandhan Nifty 50 Index Direct Growth
    "Invesco Midcap": 120403,
    "Bandhan Smallcap": 147946,
}

WINDOW_START = "2024-09-01"
WINDOW_END = "2026-09-01"  # through latest available before Sep 2026
MIN_HISTORY_DAYS = 730  # 2 years
RF_ANNUAL = 0.068


def fetch_nav(code: int) -> list[tuple[datetime, float]]:
    url = f"https://api.mfapi.in/mf/{code}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    data = json.loads(urllib.request.urlopen(req, timeout=60).read())
    navs = []
    for row in data["data"]:
        d = datetime.strptime(row["date"], "%d-%m-%Y")
        navs.append((d, float(row["nav"])))
    navs.sort(key=lambda x: x[0])
    return navs


def filter_window(navs, start: str, end: str):
    s = datetime.strptime(start, "%Y-%m-%d")
    e = datetime.strptime(end, "%Y-%m-%d")
    w = [(d, n) for d, n in navs if s <= d <= e]
    return w


def daily_returns(navs):
    rets = []
    for i in range(1, len(navs)):
        r = navs[i][1] / navs[i - 1][1] - 1
        rets.append((navs[i][0], r))
    return rets


def cagr(navs):
    if len(navs) < 2:
        return None
    years = (navs[-1][0] - navs[0][0]).days / 365.25
    if years <= 0:
        return None
    return (navs[-1][1] / navs[0][1]) ** (1 / years) - 1


def max_drawdown(navs):
    peak = navs[0][1]
    max_dd = 0.0
    for _, n in navs:
        peak = max(peak, n)
        dd = n / peak - 1
        max_dd = min(max_dd, dd)
    return max_dd


def ann_vol(daily_rets):
    if len(daily_rets) < 2:
        return None
    return stdev(daily_rets) * math.sqrt(252)


def percentile_rank(values, x, higher_better=True):
    if len(values) <= 1:
        return 50.0
    if higher_better:
        below = sum(1 for v in values if v < x)
    else:
        below = sum(1 for v in values if v > x)
    return 100 * below / (len(values) - 1)


def align_daily(rets_a, rets_b):
    dict_b = {d: r for d, r in rets_b}
    a, b = [], []
    for d, r in rets_a:
        if d in dict_b:
            a.append(r)
            b.append(dict_b[d])
    return a, b


def jensen_alpha(fund_rets, bench_rets, rf_daily):
    fa, ba = align_daily(fund_rets, bench_rets)
    if len(fa) < 60:
        return None, None
    excess_f = [r - rf_daily for r in fa]
    excess_b = [r - rf_daily for r in ba]
    mean_ef, mean_eb = mean(excess_f), mean(excess_b)
    var_b = sum((x - mean_eb) ** 2 for x in excess_b)
    if var_b == 0:
        return None, None
    cov = sum((excess_f[i] - mean_ef) * (excess_b[i] - mean_eb) for i in range(len(fa))) / (len(fa) - 1)
    beta = cov / (var_b / (len(fa) - 1))
    alpha_daily = mean_ef - beta * mean_eb
    alpha_annual = (1 + alpha_daily) ** 252 - 1
    return alpha_annual, beta


def blend_navs(nav_a, nav_b, weight_a=0.5):
    dict_b = {d: n for d, n in nav_b}
    blended = []
    for d, n in nav_a:
        if d in dict_b:
            blended.append((d, weight_a * n + (1 - weight_a) * dict_b[d]))
    return blended


def period_cagrs(navs, end_date):
    """1Y, 2Y, 3Y CAGR ending at end_date."""
    end = datetime.strptime(end_date, "%Y-%m-%d")
    dict_nav = {d: n for d, n in navs}
    # find closest end nav
    avail = [d for d in dict_nav if d <= end]
    if not avail:
        return {}
    end_d = max(avail)
    end_n = dict_nav[end_d]
    out = {}
    for label, years in [("1Y", 1), ("2Y", 2), ("3Y", 3)]:
        start_d = end_d.replace(year=end_d.year - years)
        candidates = [d for d in dict_nav if d <= start_d]
        if not candidates:
            continue
        start_d2 = max(candidates)
        start_n = dict_nav[start_d2]
        yrs = (end_d - start_d2).days / 365.25
        if yrs >= years * 0.9:
            out[label] = (end_n / start_n) ** (1 / yrs) - 1
    return out


def main():
    all_navs = {}
    print("Fetching NAV data...")
    for name, meta in {**PRODUCTS, **BENCHMARKS}.items():
        try:
            navs = fetch_nav(meta if isinstance(meta, int) else meta["code"])
            all_navs[name] = navs
            span = (navs[-1][0] - navs[0][0]).days
            print(f"  {name}: {len(navs)} points, {navs[0][0].date()} → {navs[-1][0].date()} ({span}d)")
        except Exception as e:
            print(f"  FAIL {name}: {e}")

    # Qualify products with 2+ years history
    qualified = {}
    excluded = {}
    for name, meta in PRODUCTS.items():
        navs = all_navs.get(name, [])
        if not navs:
            excluded[name] = "no data"
            continue
        span_days = (navs[-1][0] - navs[0][0]).days
        if span_days < MIN_HISTORY_DAYS:
            excluded[name] = f"only {span_days}d history (need {MIN_HISTORY_DAYS}d)"
            continue
        qualified[name] = meta

    print(f"\nQualified: {len(qualified)} | Excluded: {len(excluded)}")
    for n, r in excluded.items():
        print(f"  EXCLUDED: {n} — {r}")

    # 2Y analysis window
    windowed = {}
    for name in qualified:
        w = filter_window(all_navs[name], WINDOW_START, WINDOW_END)
        if len(w) >= 200:
            windowed[name] = w

    bench_navs = filter_window(all_navs["Nifty 50 (Jensen benchmark)"], WINDOW_START, WINDOW_END)
    bench_rets = daily_returns(bench_navs)
    rf_daily = (1 + RF_ANNUAL) ** (1 / 252) - 1

    metrics = []
    for name, w in windowed.items():
        dr = [r for _, r in daily_returns(w)]
        c = cagr(w)
        mdd = max_drawdown(w)
        vol = ann_vol(dr)
        fund_rets = daily_returns(w)
        alpha, beta = jensen_alpha(fund_rets, bench_rets, rf_daily)
        metrics.append({
            "name": name,
            "type": qualified[name]["type"],
            "index": qualified[name]["index"],
            "cagr": c,
            "max_dd": mdd,
            "vol": vol,
            "alpha": alpha,
            "beta": beta,
        })

    cagrs = [m["cagr"] for m in metrics if m["cagr"] is not None]
    dds = [m["max_dd"] for m in metrics if m["max_dd"] is not None]
    vols = [m["vol"] for m in metrics if m["vol"] is not None]

    for m in metrics:
        m["cagr_pctile"] = percentile_rank(cagrs, m["cagr"], higher_better=True)
        m["dd_pctile"] = percentile_rank(dds, m["max_dd"], higher_better=True)  # less negative = better
        m["vol_pctile"] = percentile_rank(vols, m["vol"], higher_better=False)  # lower vol = better
        m["score"] = (m["cagr_pctile"] + m["dd_pctile"] + m["vol_pctile"]) / 3

    metrics.sort(key=lambda x: -x["score"])
    top5 = metrics[:5]

    # Blend comparison
    inv_navs = all_navs["Invesco Midcap"]
    ban_navs = all_navs["Bandhan Smallcap"]
    blend = blend_navs(inv_navs, ban_navs)
    end_date = min(inv_navs[-1][0], ban_navs[-1][0]).strftime("%Y-%m-%d")
    blend_cagrs = period_cagrs(blend, end_date)

    # Average N200 Momentum 30 ETF metrics
    n200_etfs = [m for m in metrics if m["index"] == "Nifty 200 Momentum 30" and m["type"] == "ETF"]
    mid150 = [m for m in metrics if m["index"] == "Nifty Midcap 150 Momentum 50"]

    output = {
        "analysis_date": datetime.now().strftime("%Y-%m-%d"),
        "window": f"{WINDOW_START} to latest in Sep 2026",
        "qualified_count": len(qualified),
        "excluded": excluded,
        "all_metrics": metrics,
        "top5": top5,
        "blend_cagrs": blend_cagrs,
        "n200_etf_avg": {
            "cagr": mean([m["cagr"] for m in n200_etfs]),
            "max_dd": mean([m["max_dd"] for m in n200_etfs]),
            "vol": mean([m["vol"] for m in n200_etfs]),
        } if n200_etfs else None,
        "mid150_metrics": mid150,
        "nifty50_2y_cagr": cagr(bench_navs),
    }

    with open("/workspace/artifacts/momentum-analysis-raw.json", "w") as f:
        json.dump(output, f, indent=2, default=str)

    # Print summary
    print("\n=== ALL QUALIFIED (sorted by score) ===")
    print(f"{'Rank':<5} {'Product':<40} {'Type':<12} {'CAGR':>8} {'MaxDD':>8} {'Vol':>7} {'Score':>6} {'Jensen α':>9}")
    for i, m in enumerate(metrics, 1):
        a = f"{m['alpha']*100:+.2f}%" if m['alpha'] is not None else "N/A"
        print(f"{i:<5} {m['name']:<40} {m['type']:<12} {m['cagr']*100:7.2f}% {m['max_dd']*100:7.1f}% {m['vol']*100:6.1f}% {m['score']:5.1f} {a:>9}")

    print("\n=== TOP 5 ===")
    for m in top5:
        print(f"  {m['name']}: score={m['score']:.1f}, α={m['alpha']*100:+.2f}%")

    print("\n=== MIDCAP 150 MOMENTUM 50 (previously excluded) ===")
    for m in mid150:
        print(f"  {m['name']}: CAGR={m['cagr']*100:.2f}%, DD={m['max_dd']*100:.1f}%, Vol={m['vol']*100:.1f}%, Score={m['score']:.1f}, α={m['alpha']*100:+.2f}%")

    print(f"\n=== 50:50 Invesco Midcap + Bandhan Smallcap (to {end_date}) ===")
    for k, v in blend_cagrs.items():
        print(f"  {k}: {v*100:.1f}%")

    if n200_etfs:
        print(f"\n=== N200 Momentum 30 ETF average ===")
        print(f"  CAGR: {output['n200_etf_avg']['cagr']*100:.2f}%")
        print(f"  Max DD: {output['n200_etf_avg']['max_dd']*100:.1f}%")

    print(f"\nNifty 50 2Y CAGR: {output['nifty50_2y_cagr']*100:.2f}%")


if __name__ == "__main__":
    main()
