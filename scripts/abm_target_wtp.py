#!/usr/bin/env python3
"""
FINDGAGU OS — Target customer Agent-Based Model
Product under test: 광고대기실 + B/A 릴스 + 중간랜딩 + 쇼룸형 홈 + 자동발행
(상담/주문관리 제외)

Not empirical survey data — structural ABM from ICP priors + decision rules.
Seed fixed for reproducibility.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

RNG = np.random.default_rng(42)

# Price ladder to probe (KRW / month)
PRICE_POINTS = [49_000, 79_000, 99_000, 129_000, 149_000, 199_000]

PRODUCT = {
    "name": "광고Ops 루프",
    "includes": ["대기실", "B/A릴스", "중간랜딩(B1+A_n)", "쇼룸형홈", "자동발행"],
    "excludes": ["주문관리", "상담CRM풀"],
}


@dataclass(frozen=True)
class SegmentPrior:
    key: str
    label: str
    weight: float  # share of simulated SAM sample
    # latent trait means in [0, 1]
    photo_pain: float
    shorts_reliance: float
    time_poverty: float
    agency_fatigue: float
    evidence_need: float  # wants mid-landing + home, not just reels
    digital_ready: float
    # WTP lognormal-ish via mean/std of max monthly KRW
    wtp_mu: float
    wtp_sigma: float
    budget_hard_cap: float


SEGMENTS = [
    SegmentPrior(
        "sme_interior",
        "중소 인테리어 디자인·시공",
        0.38,
        photo_pain=0.82,
        shorts_reliance=0.78,
        time_poverty=0.80,
        agency_fatigue=0.70,
        evidence_need=0.72,
        digital_ready=0.65,
        wtp_mu=110_000,
        wtp_sigma=38_000,
        budget_hard_cap=300_000,
    ),
    SegmentPrior(
        "home_care",
        "홈케어·부분시공·리폼",
        0.28,
        photo_pain=0.75,
        shorts_reliance=0.70,
        time_poverty=0.88,
        agency_fatigue=0.45,
        evidence_need=0.55,
        digital_ready=0.50,
        wtp_mu=72_000,
        wtp_sigma=28_000,
        budget_hard_cap=150_000,
    ),
    SegmentPrior(
        "agency",
        "촬영·마케팅 대행사",
        0.12,
        photo_pain=0.70,
        shorts_reliance=0.85,
        time_poverty=0.75,
        agency_fatigue=0.25,  # they ARE the agency
        evidence_need=0.60,
        digital_ready=0.88,
        wtp_mu=220_000,
        wtp_sigma=70_000,
        budget_hard_cap=500_000,
    ),
    SegmentPrior(
        "brand",
        "가구·빌트인·리모델링 브랜드",
        0.10,
        photo_pain=0.60,
        shorts_reliance=0.55,
        time_poverty=0.45,
        agency_fatigue=0.50,
        evidence_need=0.80,
        digital_ready=0.70,
        wtp_mu=180_000,
        wtp_sigma=60_000,
        budget_hard_cap=400_000,
    ),
    SegmentPrior(
        "franchise",
        "프랜차이즈 인테리어 본사",
        0.05,
        photo_pain=0.55,
        shorts_reliance=0.50,
        time_poverty=0.40,
        agency_fatigue=0.40,
        evidence_need=0.75,
        digital_ready=0.60,
        wtp_mu=260_000,
        wtp_sigma=90_000,
        budget_hard_cap=800_000,
    ),
    SegmentPrior(
        "apt_facility",
        "아파트 커뮤니티·시설 (대조군)",
        0.07,
        photo_pain=0.25,
        shorts_reliance=0.15,
        time_poverty=0.35,
        agency_fatigue=0.20,
        evidence_need=0.30,
        digital_ready=0.40,
        wtp_mu=25_000,
        wtp_sigma=15_000,
        budget_hard_cap=50_000,
    ),
]


def clip01(x: float) -> float:
    return float(np.clip(x, 0.0, 1.0))


def sample_trait(mean: float, spread: float = 0.12) -> float:
    return clip01(float(RNG.normal(mean, spread)))


def sample_wtp(seg: SegmentPrior) -> float:
    # Normal truncated to (15k, hard_cap)
    w = float(RNG.normal(seg.wtp_mu, seg.wtp_sigma))
    return float(np.clip(w, 15_000, seg.budget_hard_cap))


def intent_score(traits: dict[str, float]) -> float:
    """
    Structural utility for THIS product shape:
    - photo pain + shorts + time poverty drive core need
    - evidence_need aligns with mid-landing + living home (bonus)
    - agency_fatigue helps SME; agencies care about throughput (digital_ready)
    """
    core = (
        0.28 * traits["photo_pain"]
        + 0.22 * traits["shorts_reliance"]
        + 0.20 * traits["time_poverty"]
        + 0.12 * traits["agency_fatigue"]
        + 0.12 * traits["evidence_need"]
        + 0.06 * traits["digital_ready"]
    )
    # Interaction: shorts + evidence = funnel match for our ladder
    funnel_fit = traits["shorts_reliance"] * traits["evidence_need"]
    score = 0.85 * core + 0.15 * funnel_fit
    return clip01(score)


def decide(intent: float, wtp: float, price: int) -> dict:
    # Soft threshold with noise
    threshold = float(RNG.normal(0.52, 0.04))
    wants = intent >= threshold
    can_pay = wtp >= price * 0.92  # slight stretch allowed
    # Price pain reduces close probability even if WTP >= price
    stretch = price / max(wtp, 1)
    close_p = intent * (1.1 - 0.45 * max(0.0, stretch - 0.85))
    close_p = clip01(close_p)
    buys = wants and can_pay and (RNG.random() < close_p)
    return {
        "intent_pass": wants,
        "afford": can_pay,
        "buy": buys,
        "close_p": close_p,
    }


def spawn_agent(seg: SegmentPrior) -> dict:
    traits = {
        "photo_pain": sample_trait(seg.photo_pain),
        "shorts_reliance": sample_trait(seg.shorts_reliance),
        "time_poverty": sample_trait(seg.time_poverty),
        "agency_fatigue": sample_trait(seg.agency_fatigue),
        "evidence_need": sample_trait(seg.evidence_need),
        "digital_ready": sample_trait(seg.digital_ready),
    }
    intent = intent_score(traits)
    wtp = sample_wtp(seg)
    # Intent lifts/suppresses effective WTP
    wtp_eff = float(np.clip(wtp * (0.75 + 0.5 * intent), 15_000, seg.budget_hard_cap))
    return {
        "segment": seg.key,
        "label": seg.label,
        "traits": traits,
        "intent": intent,
        "wtp_raw": wtp,
        "wtp": wtp_eff,
    }


def run(n: int = 5000) -> dict:
    # Allocate agents by weight
    keys = [s.key for s in SEGMENTS]
    weights = np.array([s.weight for s in SEGMENTS], dtype=float)
    weights /= weights.sum()
    seg_by_key = {s.key: s for s in SEGMENTS}
    picks = RNG.choice(keys, size=n, p=weights)

    agents = [spawn_agent(seg_by_key[k]) for k in picks]

    # Aggregate WTP / intent
    wtps = np.array([a["wtp"] for a in agents])
    intents = np.array([a["intent"] for a in agents])

    by_seg: dict[str, dict] = {}
    for seg in SEGMENTS:
        mask = np.array([a["segment"] == seg.key for a in agents])
        if not mask.any():
            continue
        sw = wtps[mask]
        si = intents[mask]
        by_seg[seg.key] = {
            "label": seg.label,
            "n": int(mask.sum()),
            "share": float(mask.mean()),
            "intent_mean": float(si.mean()),
            "intent_p70": float(np.quantile(si, 0.70)),
            "wtp_p25": float(np.quantile(sw, 0.25)),
            "wtp_p50": float(np.quantile(sw, 0.50)),
            "wtp_p75": float(np.quantile(sw, 0.75)),
            "intent_ge_052": float((si >= 0.52).mean()),
        }

    # Demand curve
    demand = []
    for price in PRICE_POINTS:
        buys = 0
        intent_ok = 0
        for a in agents:
            d = decide(a["intent"], a["wtp"], price)
            intent_ok += int(d["intent_pass"])
            buys += int(d["buy"])
        demand.append(
            {
                "price": price,
                "intent_rate": intent_ok / n,
                "buy_rate": buys / n,
                "buy_n": buys,
            }
        )

    # Primary ICP only demand (sme + home_care)
    primary = [a for a in agents if a["segment"] in ("sme_interior", "home_care")]
    primary_demand = []
    for price in PRICE_POINTS:
        buys = sum(1 for a in primary if decide(a["intent"], a["wtp"], price)["buy"])
        primary_demand.append(
            {
                "price": price,
                "buy_rate": buys / max(len(primary), 1),
                "n": len(primary),
            }
        )

    # Recommended price: maximize buy_rate * price among primary, with buy_rate >= 0.15
    scored = []
    for row in primary_demand:
        score = row["buy_rate"] * row["price"]
        scored.append({**row, "expected_arpu_contrib": score})
    feasible = [r for r in scored if r["buy_rate"] >= 0.15]
    best = max(feasible or scored, key=lambda r: r["expected_arpu_contrib"])

    # Segment buy rates at 99k and 129k
    spotlight_prices = [99_000, 129_000]
    seg_at_price = {}
    for price in spotlight_prices:
        seg_at_price[str(price)] = {}
        for seg in SEGMENTS:
            subset = [a for a in agents if a["segment"] == seg.key]
            if not subset:
                continue
            br = np.mean([decide(a["intent"], a["wtp"], price)["buy"] for a in subset])
            seg_at_price[str(price)][seg.key] = {
                "label": seg.label,
                "buy_rate": float(br),
            }

    return {
        "meta": {
            "n_agents": n,
            "seed": 42,
            "product": PRODUCT,
            "note": "ABM from ICP priors + structural utility; not survey-validated WTP",
        },
        "population": {
            "intent_mean": float(intents.mean()),
            "intent_ge_052": float((intents >= 0.52).mean()),
            "wtp_p25": float(np.quantile(wtps, 0.25)),
            "wtp_p50": float(np.quantile(wtps, 0.50)),
            "wtp_p75": float(np.quantile(wtps, 0.75)),
        },
        "by_segment": by_seg,
        "demand_curve": demand,
        "primary_demand": primary_demand,
        "recommended": best,
        "segment_buy_at_price": seg_at_price,
    }


def main() -> None:
    result = run(5000)
    out = Path(__file__).resolve().parents[1] / "docs" / "abm_target_wtp_result.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
