#!/usr/bin/env python3
"""교육가구 아웃리치용 원문 본문 추출 (Scrapling).

stdout JSON:
  { ok, engine, finalUrl, title, text, excerpt }
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def clean_text(text: str) -> str:
    text = re.sub(r"\n{3,}", "\n\n", text or "")
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def clip(text: str, max_len: int = 3500) -> str:
    text = clean_text(text)
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def extract_with_scrapling(url: str) -> dict:
    from scrapling.fetchers import DynamicFetcher

    page = DynamicFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        disable_resources=True,
        timeout=45000,
    )
    final_url = getattr(page, "url", None) or url

    # Prefer article-ish selectors when present
    selectors = [
        "article",
        ".article-body",
        "#article-view-content-div",
        ".news_body",
        "#articeBody",
        "#articleBody",
        ".view-content",
        "main",
    ]
    chunks: list[str] = []
    for sel in selectors:
        try:
            nodes = page.css(sel)
        except Exception:
            nodes = []
        if not nodes:
            continue
        for node in nodes[:3]:
            try:
                part = node.get_all_text(separator="\n", strip=True)
            except Exception:
                part = str(node)
            part = clean_text(part)
            if len(part) > 120:
                chunks.append(part)
        if chunks:
            break

    if not chunks:
        try:
            chunks.append(
                clean_text(page.get_all_text(ignore_tags=("script", "style", "noscript")))
            )
        except Exception:
            chunks.append(clean_text(str(page)[:5000]))

    text = clip(max(chunks, key=len))
    title = ""
    try:
        title_nodes = page.css("h1")
        if title_nodes:
            title = clean_text(title_nodes[0].get_all_text(strip=True))
    except Exception:
        pass
    if not title:
        try:
            title = clean_text(page.css("title")[0].get_all_text(strip=True))
        except Exception:
            title = ""

    if len(text) < 80:
        raise RuntimeError("본문 길이가 너무 짧습니다.")

    return {
        "ok": True,
        "engine": "scrapling-dynamic",
        "finalUrl": final_url,
        "title": title,
        "excerpt": text[:240],
        "text": text,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    try:
        result = extract_with_scrapling(args.url)
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        sys.stdout.write(
            json.dumps(
                {"ok": False, "engine": "scrapling-dynamic", "message": str(exc)},
                ensure_ascii=False,
            )
        )
        return 1


if __name__ == "__main__":
    # Allow running from repo root
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
