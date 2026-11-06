/* Community roster for World of Warcraft: Forever.
 *
 * Character data comes from Blizzard's Armory. A GitHub Actions workflow
 * (.github/workflows/update-roster.yml) runs scripts/fetch_armory.py every
 * hour and commits data/characters.json; this page only reads that file.
 * No API keys, no backend. */

(function () {
  'use strict';

  const DATA_URL = 'data/characters.json';
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
  let generatedAt = null;
  let sortKey = 'level';
  let sortDir = -1;

  /* ---------- helpers ---------- */

  function levelColor(level) {
    if (level >= MAX_LEVEL) return 'var(--accent)';
    if (level >= 50) return '#a335ee';
    if (level >= 40) return '#0070dd';
    if (level >= 20) return '#1eff00';
    if (level > 0) return '#ffffff';
    return 'var(--muted)';
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  /* ---------- data ---------- */

  function normalize(c) {
    return {
      ok: !!c.ok,
      pending: !c.name,
      error: c.error || '',
      label: c.label || '',
      name: c.name || '',
      leader: !!c.leader,
      cls: c.class || '',
      race: c.race || '',
      faction: c.faction || '',
      level: Number(c.level) || 0,
      ilvl: Number(c.ilvl) || 0,
      spec: c.spec || '',
      ruleset: c.ruleset || '',
      professions: Array.isArray(c.professions) ? c.professions : [],
      thumb: c.avatar || '',
      lastUpdated: c.lastUpdated || '',
      outdated: !!c.outdated,
      url: c.url || ''
    };
  }

  async function load(force) {
    el.refresh.disabled = true;
    setStatus('Wczytywanie…');
    try {
      const res = await fetch(DATA_URL + (force ? '?t=' + Date.now() : ''), { cache: force ? 'reload' : 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      generatedAt = data.generatedAt || null;
      rows = (data.characters || []).map(normalize);
      setStatus(generatedAt ? 'Dane z Armory: ' + formatTime(generatedAt) : 'Dane z Armory');
    } catch (e) {
      rows = [];
      setStatus('Brak pliku data/characters.json (' + e.message + '). Uruchom workflow „Update roster from Armory”.');
    }
    el.refresh.disabled = false;
    render();
  }

  /* ---------- rendering ---------- */

  function compare(a, b) {
    // Pending/failed rows always sink to the bottom.
    const ra = a.ok ? 0 : 1, rb = b.ok ? 0 : 1;
    if (ra !== rb) return ra - rb;
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'class') { va = a.cls + a.spec; vb = b.cls + b.spec; }
    if (sortKey === 'professions') {
      va = a.professions.map(function (p) { return p.name; }).join(', ');
      vb = b.professions.map(function (p) { return p.name; }).join(', ');
    }
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb), 'pl') * sortDir;
  }

  function matches(row) {
    const q = el.search.value.trim().toLowerCase();
    const faction = el.faction.value;
    if (faction && row.faction !== faction) return false;
    if (!q) return true;
    const profs = row.professions.map(function (p) { return p.name; }).join(' ');
    const hay = [row.name, row.label, row.cls, row.spec, row.race, profs, row.ruleset].join(' ').toLowerCase();
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
    nameEl.textContent = row.name || row.label || '?';
    if (row.url) { nameEl.href = row.url; nameEl.target = '_blank'; nameEl.rel = 'noopener'; }
    if (row.cls && CLASS_COLORS[row.cls]) nameEl.style.color = CLASS_COLORS[row.cls];
    text.appendChild(nameEl);

    if (row.leader) {
      const crown = document.createElement('span');
      crown.className = 'leader';
      crown.title = 'Lider';
      crown.textContent = '♛';
      text.appendChild(crown);
    }

    if (row.label && row.name && row.label !== row.name) {
      const label = document.createElement('div');
      label.className = 'char-label';
      label.textContent = row.label;
      text.appendChild(label);
    }
    box.appendChild(text);
    return box;
  }

  function professionsCell(row) {
    const box = document.createElement('div');
    if (!row.professions.length) { box.textContent = '–'; return box; }
    row.professions.forEach(function (p) {
      const line = document.createElement('div');
      line.className = 'prof';
      line.textContent = p.name + (p.skill != null ? ' ' + p.skill + (p.max ? '/' + p.max : '') : '');
      box.appendChild(line);
    });
    return box;
  }

  function render() {
    const visible = rows.filter(matches).sort(compare);
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
        const err = td('error', row.error || 'błąd');
        err.colSpan = 6;
        tr.appendChild(err);
        frag.appendChild(tr);
        return;
      }

      tr.appendChild(td('', charCell(row)));

      const cls = document.createElement('div');
      const clsName = document.createElement('div');
      clsName.textContent = row.cls;
      if (CLASS_COLORS[row.cls]) clsName.style.color = CLASS_COLORS[row.cls];
      const sub = document.createElement('div');
      sub.className = 'spec';
      sub.textContent = [row.race, row.spec].filter(Boolean).join(' · ');
      cls.appendChild(clsName);
      cls.appendChild(sub);
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

      tr.appendChild(td('', professionsCell(row)));
      tr.appendChild(td('', RULESET_LABELS[row.ruleset] || row.ruleset || '–'));
      if (row.outdated) tr.title = 'Dane w Armory oznaczone jako nieaktualne';
      frag.appendChild(tr);
    });

    el.body.replaceChildren(frag);
    renderSummary();
    el.headers.forEach(function (th) {
      th.setAttribute('aria-sort', th.dataset.sort === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }

  function renderSummary() {
    const ok = rows.filter(function (r) { return r.ok; });
    const avg = function (key) {
      const vals = ok.map(function (r) { return r[key]; }).filter(function (v) { return v > 0; });
      return vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
    };
    const factions = { horde: 0, alliance: 0 };
    ok.forEach(function (r) { if (factions[r.faction] !== undefined) factions[r.faction] += 1; });

    el.statCount.textContent = ok.length + ' / ' + rows.length;
    el.statLevel.textContent = avg('level') !== null ? avg('level') : '–';
    el.statIlvl.textContent = avg('ilvl') !== null ? avg('ilvl') : '–';
    el.statFactions.textContent = ok.length ? factions.horde + ' / ' + factions.alliance : '–';
  }

  function renderHeader() {
    const c = (config && config.community) || {};
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
    el.refresh.addEventListener('click', function () { load(true); });
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
      if (res.ok) config = await res.json();
    } catch (e) { /* header falls back to defaults */ }
    renderHeader();
    bind();
    await load(false);
  }

  boot();
})();
