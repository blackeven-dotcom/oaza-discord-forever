/* Community roster for World of Warcraft: Forever, powered by the public
 * Raider.IO API (forever.raider.io). Configuration lives in roster.json.
 * No build step, no secrets.
 *
 * Forever has no realms: Raider.IO identifies a character by region, ruleset
 * ("normal" or "pvp") and its full two-word name, e.g. "Jokerd Prime". */

(function () {
  'use strict';

  const API_URL = 'https://forever.raider.io/api/v1/characters/profile';
  const API_FIELDS = 'gear,guild';
  const CONCURRENCY = 4;
  const CACHE_PREFIX = 'rio-forever:';
  const MAX_LEVEL = 60;

  const CLASS_COLORS = {
    'Death Knight': '#C41E3A',
    'Demon Hunter': '#A330C9',
    'Druid': '#FF7C0A',
    'Evoker': '#33937F',
    'Hunter': '#AAD372',
    'Mage': '#3FC7EB',
    'Monk': '#00FF98',
    'Paladin': '#F48CBA',
    'Priest': '#FFFFFF',
    'Rogue': '#FFF468',
    'Shaman': '#0070DD',
    'Warlock': '#8788EE',
    'Warrior': '#C69B3A'
  };

  const FACTION_LABELS = { horde: 'Horda', alliance: 'Przymierze' };
  const RULESET_LABELS = { normal: 'Normal', pvp: 'PvP' };

  const el = {
    name: document.getElementById('community-name'),
    tagline: document.getElementById('community-tagline'),
    links: document.getElementById('community-links'),
    body: document.getElementById('roster-body'),
    search: document.getElementById('search'),
    faction: document.getElementById('faction-filter'),
    refresh: document.getElementById('refresh'),
    status: document.getElementById('status'),
    statCount: document.getElementById('stat-count'),
    statLevel: document.getElementById('stat-level'),
    statIlvl: document.getElementById('stat-ilvl'),
    statFactions: document.getElementById('stat-factions'),
    headers: Array.from(document.querySelectorAll('th[data-sort]'))
  };

  let config = null;
  let rows = [];
  let sortKey = 'level';
  let sortDir = -1;

  /* ---------- helpers ---------- */

  function rulesetOf(entry) {
    return String(entry.ruleset || config.community.ruleset || 'normal').trim().toLowerCase();
  }

  function regionOf() {
    return config.community.region || 'eu';
  }

  function levelColor(level) {
    if (level >= MAX_LEVEL) return 'var(--accent)';
    if (level >= 50) return '#a335ee';
    if (level >= 40) return '#0070dd';
    if (level >= 20) return '#1eff00';
    if (level > 0) return '#ffffff';
    return 'var(--muted)';
  }

  function cacheKey(entry) {
    return CACHE_PREFIX + regionOf() + ':' + rulesetOf(entry) + ':' + entry.name.trim().toLowerCase();
  }

  function cacheGet(entry) {
    try {
      const raw = localStorage.getItem(cacheKey(entry));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ttl = (config.cacheMinutes || 10) * 60 * 1000;
      if (Date.now() - parsed.t > ttl) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function cacheSet(entry, data) {
    try {
      localStorage.setItem(cacheKey(entry), JSON.stringify({ t: Date.now(), data: data }));
    } catch (e) { /* storage may be unavailable; ignore */ }
  }

  function cacheClear() {
    try {
      Object.keys(localStorage)
        .filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  /* ---------- data ---------- */

  function buildUrl(entry) {
    const params = new URLSearchParams({
      region: regionOf(),
      realm: rulesetOf(entry),
      name: entry.name.trim(),
      fields: API_FIELDS
    });
    return API_URL + '?' + params.toString();
  }

  function profileUrl(entry) {
    return 'https://forever.raider.io/characters/' + regionOf() + '/' + rulesetOf(entry) + '/' + encodeURIComponent(entry.name.trim());
  }

  async function fetchCharacter(entry, force) {
    if (!force) {
      const cached = cacheGet(entry);
      if (cached) return cached;
    }
    const res = await fetch(buildUrl(entry), { headers: { Accept: 'application/json' } });
    if (res.status === 404 || res.status === 400) {
      throw new Error('nie znaleziono na Raider.IO');
    }
    if (res.status === 429) {
      throw new Error('limit zapytań, spróbuj za chwilę');
    }
    if (!res.ok) {
      throw new Error('błąd ' + res.status);
    }
    const data = await res.json();
    cacheSet(entry, data);
    return data;
  }

  function normalize(entry, data) {
    return {
      entry: entry,
      ok: true,
      name: data.name || entry.name,
      ruleset: rulesetOf(entry),
      cls: data.class || '',
      race: data.race || '',
      faction: data.faction || '',
      level: Number(data.level) || 0,
      ilvl: data.gear ? Number(data.gear.item_level_equipped) || 0 : 0,
      guild: data.guild && data.guild.name ? data.guild.name : '',
      thumb: data.thumbnail_url || '',
      url: data.profile_url || profileUrl(entry)
    };
  }

  function failed(entry, message) {
    return {
      entry: entry, ok: false, error: message,
      name: entry.name, ruleset: rulesetOf(entry), cls: '', race: '', faction: '',
      level: 0, ilvl: 0, guild: '', thumb: '', url: profileUrl(entry)
    };
  }

  function pending(entry) {
    return {
      entry: entry, ok: false, pending: true,
      name: '', ruleset: rulesetOf(entry), cls: '', race: '', faction: '',
      level: 0, ilvl: 0, guild: '', thumb: '', url: ''
    };
  }

  async function loadAll(force) {
    const entries = config.characters || [];
    rows = entries.map(function (entry) {
      return entry.name ? null : pending(entry);
    });

    const queue = entries
      .map(function (entry, i) { return { entry: entry, i: i }; })
      .filter(function (item) { return item.entry.name; });

    let done = 0;
    const total = queue.length;
    el.refresh.disabled = true;
    setStatus(total ? 'Pobieranie 0/' + total + '…' : '');

    async function worker() {
      while (queue.length) {
        const item = queue.shift();
        try {
          const data = await fetchCharacter(item.entry, force);
          rows[item.i] = normalize(item.entry, data);
        } catch (e) {
          rows[item.i] = failed(item.entry, e.message || 'błąd');
        }
        done += 1;
        setStatus('Pobieranie ' + done + '/' + total + '…');
        render();
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total || 1) }, worker));
    el.refresh.disabled = false;
    setStatus(total ? 'Zaktualizowano ' + new Date().toLocaleTimeString('pl-PL') : 'Brak postaci w roster.json');
    render();
  }

  /* ---------- rendering ---------- */

  function compare(a, b) {
    // Pending/failed rows always sink to the bottom.
    const ra = a.ok ? 0 : 1, rb = b.ok ? 0 : 1;
    if (ra !== rb) return ra - rb;
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'class') { va = a.cls + a.race; vb = b.cls + b.race; }
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb), 'pl') * sortDir;
  }

  function matches(row) {
    const q = el.search.value.trim().toLowerCase();
    const faction = el.faction.value;
    if (faction && row.faction !== faction) return false;
    if (!q) return true;
    const hay = [row.name, row.entry.label, row.cls, row.race, row.guild, row.ruleset].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function td(className, content) {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    if (content instanceof Node) cell.appendChild(content); else cell.textContent = content;
    return cell;
  }

  function charCell(row) {
    const box = document.createElement('div');
    box.className = 'char';

    const img = document.createElement('img');
    img.className = 'avatar';
    img.alt = '';
    img.loading = 'lazy';
    if (row.thumb) img.src = row.thumb;
    box.appendChild(img);

    const text = document.createElement('div');
    const nameEl = document.createElement(row.url ? 'a' : 'span');
    nameEl.className = 'char-name';
    nameEl.textContent = row.name || row.entry.label || '?';
    if (row.url) { nameEl.href = row.url; nameEl.target = '_blank'; nameEl.rel = 'noopener'; }
    if (row.cls && CLASS_COLORS[row.cls]) nameEl.style.color = CLASS_COLORS[row.cls];
    text.appendChild(nameEl);

    if (row.entry.leader) {
      const crown = document.createElement('span');
      crown.className = 'leader';
      crown.title = 'Lider';
      crown.textContent = '♛';
      text.appendChild(crown);
    }

    if (row.entry.label && row.name && row.entry.label !== row.name) {
      const label = document.createElement('div');
      label.className = 'char-label';
      label.textContent = row.entry.label;
      text.appendChild(label);
    }
    box.appendChild(text);
    return box;
  }

  function render() {
    const visible = rows.filter(Boolean).filter(matches).sort(compare);
    const frag = document.createDocumentFragment();

    visible.forEach(function (row) {
      const tr = document.createElement('tr');

      if (row.pending) {
        tr.className = 'pending';
        tr.appendChild(td('', charCell(row)));
        const note = td('note', 'uzupełnij nazwę postaci w roster.json');
        note.colSpan = 6;
        tr.appendChild(note);
        frag.appendChild(tr);
        return;
      }

      if (!row.ok) {
        tr.appendChild(td('', charCell(row)));
        const err = td('error', row.error);
        err.colSpan = 5;
        tr.appendChild(err);
        tr.appendChild(td('', RULESET_LABELS[row.ruleset] || row.ruleset));
        frag.appendChild(tr);
        return;
      }

      tr.appendChild(td('', charCell(row)));

      const cls = document.createElement('div');
      const clsName = document.createElement('div');
      clsName.textContent = row.cls;
      if (CLASS_COLORS[row.cls]) clsName.style.color = CLASS_COLORS[row.cls];
      const race = document.createElement('div');
      race.className = 'spec';
      race.textContent = row.race;
      cls.appendChild(clsName);
      cls.appendChild(race);
      tr.appendChild(td('', cls));

      const level = document.createElement('span');
      level.className = 'score';
      level.textContent = row.level ? String(row.level) : '–';
      level.style.color = levelColor(row.level);
      tr.appendChild(td('num', level));

      tr.appendChild(td('num', row.ilvl ? String(row.ilvl) : '–'));

      const faction = document.createElement('span');
      faction.className = 'faction faction-' + row.faction;
      faction.textContent = FACTION_LABELS[row.faction] || row.faction || '–';
      tr.appendChild(td('', faction));

      tr.appendChild(td('', row.guild || '–'));
      tr.appendChild(td('', RULESET_LABELS[row.ruleset] || row.ruleset));
      frag.appendChild(tr);
    });

    el.body.replaceChildren(frag);
    renderSummary();
    el.headers.forEach(function (th) {
      th.setAttribute('aria-sort', th.dataset.sort === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }

  function renderSummary() {
    const ok = rows.filter(function (r) { return r && r.ok; });
    const avg = function (key) {
      const vals = ok.map(function (r) { return r[key]; }).filter(function (v) { return v > 0; });
      return vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
    };
    const factions = { horde: 0, alliance: 0 };
    ok.forEach(function (r) { if (factions[r.faction] !== undefined) factions[r.faction] += 1; });

    el.statCount.textContent = ok.length + ' / ' + rows.filter(Boolean).length;
    el.statLevel.textContent = avg('level') !== null ? avg('level') : '–';
    el.statIlvl.textContent = avg('ilvl') !== null ? avg('ilvl') : '–';
    el.statFactions.textContent = ok.length ? factions.horde + ' / ' + factions.alliance : '–';
  }

  function renderHeader() {
    const c = config.community || {};
    el.name.textContent = c.name || 'Roster';
    document.title = (c.name ? c.name + ' – ' : '') + 'Roster';
    el.tagline.textContent = c.tagline || '';
    el.links.replaceChildren();
    if (c.discord) {
      const a = document.createElement('a');
      a.href = c.discord; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Discord';
      el.links.appendChild(a);
    }
  }

  /* ---------- boot ---------- */

  function bind() {
    el.search.addEventListener('input', render);
    el.faction.addEventListener('change', render);
    el.refresh.addEventListener('click', function () { cacheClear(); loadAll(true); });
    el.headers.forEach(function (th) {
      th.addEventListener('click', function () {
        const key = th.dataset.sort;
        if (sortKey === key) { sortDir = -sortDir; } else { sortKey = key; sortDir = (key === 'level' || key === 'ilvl') ? -1 : 1; }
        render();
      });
    });
  }

  async function boot() {
    try {
      const res = await fetch('roster.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      config = await res.json();
    } catch (e) {
      setStatus('Nie udało się wczytać roster.json: ' + e.message);
      return;
    }
    renderHeader();
    bind();
    await loadAll(false);
  }

  boot();
})();
