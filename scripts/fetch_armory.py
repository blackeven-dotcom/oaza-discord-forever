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


# Role estimate: active spec first, class default when no spec is known.
ROLE_BY_SPEC = {
    ("warrior", "protection"): "tank",
    ("warrior", "arms"): "melee",
    ("warrior", "fury"): "melee",
    ("paladin", "protection"): "tank",
    ("paladin", "holy"): "healer",
    ("paladin", "retribution"): "melee",
    ("druid", "feral combat"): "melee",
    ("druid", "feral"): "melee",
    ("druid", "guardian"): "tank",
    ("druid", "restoration"): "healer",
    ("druid", "balance"): "range",
    ("priest", "shadow"): "range",
    ("priest", "shadow magic"): "range",
    ("priest", "holy"): "healer",
    ("priest", "discipline"): "healer",
    ("shaman", "enhancement"): "melee",
    ("shaman", "elemental"): "range",
    ("shaman", "restoration"): "healer",
    ("hunter", "beast mastery"): "range",
    ("hunter", "marksmanship"): "range",
    ("hunter", "survival"): "range",
    ("rogue", "assassination"): "melee",
    ("rogue", "combat"): "melee",
    ("rogue", "subtlety"): "melee",
    ("mage", "arcane"): "range",
    ("mage", "fire"): "range",
    ("mage", "frost"): "range",
    ("warlock", "affliction"): "range",
    ("warlock", "demonology"): "range",
    ("warlock", "destruction"): "range",
    ("death knight", "blood"): "tank",
    ("death knight", "frost"): "melee",
    ("death knight", "unholy"): "melee",
    ("monk", "brewmaster"): "tank",
    ("monk", "mistweaver"): "healer",
    ("monk", "windwalker"): "melee",
    ("demon hunter", "vengeance"): "tank",
    ("demon hunter", "havoc"): "melee",
    ("evoker", "preservation"): "healer",
    ("evoker", "devastation"): "range",
    ("evoker", "augmentation"): "range",
}
ROLE_BY_CLASS = {
    "warrior": "melee", "paladin": "melee", "rogue": "melee", "shaman": "melee",
    "death knight": "melee", "monk": "melee", "demon hunter": "melee",
    "hunter": "range", "mage": "range", "warlock": "range", "evoker": "range",
    "druid": "range", "priest": "healer",
}


def estimate_role(class_name, spec_name):
    cls = (class_name or "").strip().lower()
    spec = (spec_name or "").strip().lower()
    if cls and spec and (cls, spec) in ROLE_BY_SPEC:
        return ROLE_BY_SPEC[(cls, spec)], "spec"
    if cls in ROLE_BY_CLASS:
        return ROLE_BY_CLASS[cls], "class"
    return None, None


def profession_summary(prof):
    tiers = prof.get("tiers") or []
    tier = tiers[0] if tiers else {}
    return {
        "name": prof.get("name"),
        "skill": tier.get("skillPoints"),
        "max": tier.get("maxSkillPoints"),
        "icon": (prof.get("icon") or {}).get("url"),
    }


def stat_value(stat):
    v = (stat or {}).get("value")
    if isinstance(v, dict):
        v = v.get("value")
    return v


def stats_summary(stats):
    out = []
    for s in (stats or {}).get("overview") or []:
        slug = s.get("slug")
        if slug and stat_value(s) is not None:
            out.append({"slug": slug, "value": stat_value(s)})
    return out


def gear_summary(gear):
    out = []
    for key, item in (gear or {}).items():
        if not isinstance(item, dict) or not item.get("name"):
            continue
        out.append({
            "slot": (item.get("slot") or {}).get("name") or key,
            "name": item.get("name"),
            "quality": ((item.get("quality") or {}).get("type") or "").lower(),
        })
    return out


def summarize(entry, state, url):
    c = state["character"]
    specs = sorted(c.get("specs") or [], key=lambda s: s.get("spentPoints") or 0, reverse=True)
    active = specs[0] if specs and (specs[0].get("spentPoints") or 0) > 0 else None
    pvp = c.get("pvp") or {}
    professions = c.get("professions") or {}
    primaries = professions.get("primaries") or []
    secondaries = professions.get("secondaries") or []
    media = c.get("media") or {}
    render = c.get("render") or {}
    role, role_source = estimate_role((c.get("class") or {}).get("name"), active.get("name") if active else None)
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
        "role": role,
        "roleSource": role_source,
        "specs": [
            {"name": s.get("name"), "points": s.get("spentPoints") or 0, "icon": (s.get("icon") or {}).get("url")}
            for s in specs
        ],
        "professions": [profession_summary(p) for p in primaries],
        "secondaryProfessions": [profession_summary(p) for p in secondaries],
        "honorableKills": stat_value(pvp.get("honorableKills")),
        "pvpRank": stat_value(pvp.get("rank")),
        "stats": stats_summary(c.get("stats")),
        "gear": gear_summary(c.get("gear")),
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
