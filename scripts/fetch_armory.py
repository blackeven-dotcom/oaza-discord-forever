#!/usr/bin/env python3
"""Fetch roster characters from Blizzard's World of Warcraft: Forever Armory.

Reads roster.json, downloads each character's Armory page, extracts the
embedded `characterProfileInitialState` JSON and writes a compact summary to
data/characters.json. Standard library only; no API keys required.

Usage: python scripts/fetch_armory.py [--roster roster.json] [--out data/characters.json]
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ARMORY = "https://worldofwarcraft.blizzard.com/{locale}/forever/{region}/armory/character/{slug}"
STATE_RE = re.compile(r"var characterProfileInitialState = (\{.*?\});\s*\n", re.S)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) oaza-roster/1.0"


def slugify(name):
    return "-".join(name.strip().lower().split())


def fetch(url, retries=3):
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-GB,en;q=0.8"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (404, 500):
                return e.code, ""
        except Exception as e:  # network hiccup
            last = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def profession_summary(prof):
    tiers = prof.get("tiers") or []
    tier = tiers[0] if tiers else {}
    return {
        "name": prof.get("name"),
        "skill": tier.get("skillPoints"),
        "max": tier.get("maxSkillPoints"),
        "icon": (prof.get("icon") or {}).get("url"),
    }


def summarize(entry, state, url):
    c = state["character"]
    active = next((s for s in c.get("specs") or [] if s.get("active")), None)
    professions = c.get("professions") or {}
    primaries = professions.get("primaries") or []
    secondaries = professions.get("secondaries") or []
    pvp = c.get("pvp") or {}
    media = c.get("media") or {}
    render = c.get("render") or {}
    return {
        "label": entry.get("label") or f"{c.get('name', '')} {c.get('surname', '')}".strip(),
        "name": f"{c.get('name', '')} {c.get('surname', '')}".strip(),
        "slug": c.get("slug"),
        "leader": bool(entry.get("leader")),
        "ok": True,
        "level": c.get("level"),
        "ilvl": c.get("averageItemLevel"),
        "class": (c.get("class") or {}).get("name"),
        "classSlug": (c.get("class") or {}).get("slug"),
        "race": (c.get("race") or {}).get("name"),
        "faction": (c.get("faction") or {}).get("slug"),
        "gender": (c.get("gender") or {}).get("slug"),
        "ruleset": (c.get("ruleset") or {}).get("slug"),
        "region": c.get("region"),
        "spec": active.get("name") if active else None,
        "specPoints": active.get("spentPoints") if active else None,
        "specIcon": ((active or {}).get("icon") or {}).get("url"),
        "professions": [profession_summary(p) for p in primaries],
        "secondaryProfessions": [profession_summary(p) for p in secondaries],
        "honorableKills": pvp.get("honorableKills"),
        "avatar": (c.get("avatar") or {}).get("url"),
        "render": (media.get("main-raw") or {}).get("url"),
        "background": (render.get("background") or {}).get("url"),
        "lastUpdated": (c.get("lastUpdatedTimestamp") or {}).get("iso8601"),
        "outdated": bool(c.get("isOutdated")),
        "url": url,
    }


def failed(entry, message, url):
    return {
        "label": entry.get("label") or entry.get("name", ""),
        "name": entry.get("name", ""),
        "leader": bool(entry.get("leader")),
        "ok": False,
        "error": message,
        "url": url,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roster", default="roster.json")
    ap.add_argument("--out", default="data/characters.json")
    ap.add_argument("--locale", default="en-gb")
    args = ap.parse_args()

    roster = json.loads(Path(args.roster).read_text(encoding="utf-8"))
    region = (roster.get("community") or {}).get("region", "eu")
    results = []
    errors = 0

    for entry in roster.get("characters") or []:
        name = (entry.get("name") or "").strip()
        if not name:
            results.append(failed(entry, "brak nazwy postaci w roster.json", ""))
            continue
        url = ARMORY.format(locale=args.locale, region=entry.get("region") or region, slug=slugify(name))
        try:
            status, html = fetch(url)
        except RuntimeError as e:
            print(f"ERR  {name}: {e}", file=sys.stderr)
            results.append(failed(entry, "błąd sieci", url))
            errors += 1
            continue
        if status != 200:
            print(f"MISS {name}: HTTP {status}", file=sys.stderr)
            results.append(failed(entry, f"brak w Armory (HTTP {status})", url))
            continue
        m = STATE_RE.search(html)
        if not m:
            print(f"ERR  {name}: no embedded state", file=sys.stderr)
            results.append(failed(entry, "nie udało się odczytać strony Armory", url))
            errors += 1
            continue
        try:
            state = json.loads(m.group(1))
            row = summarize(entry, state, url)
        except (ValueError, KeyError) as e:
            print(f"ERR  {name}: {e}", file=sys.stderr)
            results.append(failed(entry, "nieoczekiwany format danych Armory", url))
            errors += 1
            continue
        print(f"OK   {row['name']}: {row['class']} {row['level']} ilvl {row['ilvl']}")
        results.append(row)
        time.sleep(0.5)

    out = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "Blizzard Armory (World of Warcraft: Forever)",
        "characters": results,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {out_path} ({sum(1 for r in results if r['ok'])}/{len(results)} ok)")
    return 1 if errors and not any(r["ok"] for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
