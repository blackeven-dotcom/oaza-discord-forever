/* Community roster powered by the public Raider.IO API.
 * Configuration lives in roster.json. No build step, no secrets. */

(function () {
  'use strict';

  const API_URL = 'https://raider.io/api/v1/characters/profile';
  const API_FIELDS = 'gear,mythic_plus_scores_by_season:current,raid_progression,guild';
  const CONCURRENCY = 4;
  const CACHE_PREFIX = 'rio:';

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

  const ROLE_LABELS = { TANK: 'Tank', HEALING: 'Healer', DPS: 'DPS' };

  const el = {
    name: document.getElementById('community-name'),
    tagline: document.getElementById('community-tagline'),
    links: document.getElementById('community-links'),
    body: document.getElementById('roster-body'),
    search: document.getElementById('search'),
    role: document.getElementById('role-filter'),
    refresh: document.getElementById('refresh'),
    status: document.getElementById('status'),
    statCount: document.getElementById('stat-count'),
    statIlvl: document.getElementById('stat-ilvl'),
    statScore: document.getElementById('stat-score'),
    statRoles: document.getElementById('stat-roles'),
    headers: Array.from(document.querySelectorAll('th[data-sort]'))
  };

  let config = null;
  let rows = [];
  let sortKey = 'score';
  let sortDir = -1;

  /* ---------- helpers ---------- */

  function realmSlug(realm) {
    return String(realm || '')
      .trim()
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/\s+/g, '-');
  }

  function scoreColor(score) {
    if (score >= 3000) return '#ff8000';
    if (score >= 2500) return '#e268a8';
    if (score >= 2000) return '#a335ee';
    if (score >= 1500) return '#0070dd';
    if (score >= 750) return '#1eff00';
    if (score > 0) return '#ffffff';
    return 'var(--muted)';
  }

  function cacheKey(entry) {
    return CACHE_PREFIX + config.community.region + ':' + realmSlug(entry.realm) + ':' + entry.name.toLowerCase();
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
      region: config.community.region || 'eu',
      realm: realmSlug(entry.realm),
      name: entry.name.trim(),
      fields: API_FIELDS
    });
    return API_URL + '?' + params.toString();
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
    const seasons = Array.isArray(data.mythic_plus_scores_by_season) ? data.mythic_plus_scores_by_season : [];
    const score = seasons.length && seasons[0].scores ? Number(seasons[0].scores.all) || 0 : 0;

    const raids = data.raid_progression && typeof data.raid_progression === 'object'
      ? Object.keys(data.raid_progression) : [];
    const raidKey = raids[0] || null;
    const raid = raidKey ? data.raid_progression[raidKey] : null;

    return {
      entry: entry,
      ok: true,
      name: data.name || entry.name,
      realm: data.realm || entry.realm,
      cls: data.class || '',
      spec: data.active_spec_name || '',
      role: data.active_spec_role || '',
      ilvl: data.gear ? Number(data.gear.item_level_equipped) || 0 : 0,
      score: score,
      raidName: raidKey ? raidKey.replace(/-/g, ' ') : '',
      raidSummary: raid && raid.summary ? raid.summary : '',
      guild: data.guild && data.guild.name ? data.guild.name : '',
      thumb: data.thumbnail_url || '',
      url: data.profile_url || ('https://raider.io/characters/' + (config.community.region || 'eu') + '/' + realmSlug(entry.realm) + '/' + encodeURIComponent(entry.name))
    };
  }

  function failed(entry, message) {
    return {
      entry: entry, ok: false, error: message,
      name: entry.name, realm: entry.realm, cls: '', spec: '', role: '',
      ilvl: 0, score: 0, raidName: '', raidSummary: '', guild: '', thumb: '', url: ''
    };
  }

  function pending(entry) {
    return {
      entry: entry, ok: false, pending: true,
      name: '', realm: '', cls: '', spec: '', role: '',
      ilvl: 0, score: 0, raidName: '', raidSummary: '', guild: '', thumb: '', url: ''
    };
  }

  async function loadAll(force) {
    const entries = config.characters || [];
    rows = entries.map(function (entry) {
      return entry.name && entry.realm ? null : pending(entry);
    });

    const queue = entries
      .map(function (entry, i) { return { entry: entry, i: i }; })
      .filter(function (item) { return item.entry.name && item.entry.realm; });

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
    if (sortKey === 'raid') { va = a.raidSummary; vb = b.raidSummary; }
    if (sortKey === 'class') { va = a.cls + a.spec; vb = b.cls + b.spec; }
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb), 'pl') * sortDir;
  }

  function matches(row) {
    const q = el.search.value.trim().toLowerCase();
    const role = el.role.value;
    if (role && row.role !== role) return false;
    if (!q) return true;
    const hay = [row.name, row.entry.label, row.realm, row.cls, row.spec, row.guild].join(' ').toLowerCase();
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
        const note = td('note', 'uzupełnij nazwę postaci i serwer w roster.json');
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
        tr.appendChild(td('', row.realm));
        frag.appendChild(tr);
        return;
      }

      tr.appendChild(td('', charCell(row)));

      const cls = document.createElement('div');
      const clsName = document.createElement('div');
      clsName.textContent = row.cls;
      if (CLASS_COLORS[row.cls]) clsName.style.color = CLASS_COLORS[row.cls];
      const spec = document.createElement('div');
      spec.className = 'spec';
      spec.textContent = row.spec + (row.role ? ' · ' + (ROLE_LABELS[row.role] || row.role) : '');
      cls.appendChild(clsName);
      cls.appendChild(spec);
      tr.appendChild(td('', cls));

      tr.appendChild(td('num', row.ilvl ? String(row.ilvl) : '–'));

      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = row.score ? Math.round(row.score).toString() : '–';
      score.style.color = scoreColor(row.score);
      tr.appendChild(td('num', score));

      const raid = document.createElement('span');
      raid.className = 'raid';
      raid.textContent = row.raidSummary || '–';
      if (row.raidName) {
        const small = document.createElement('small');
        small.textContent = row.raidName;
        raid.appendChild(small);
      }
      tr.appendChild(td('', raid));

      tr.appendChild(td('', row.guild || '–'));
      tr.appendChild(td('', row.realm));
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
    const roles = { TANK: 0, HEALING: 0, DPS: 0 };
    ok.forEach(function (r) { if (roles[r.role] !== undefined) roles[r.role] += 1; });

    el.statCount.textContent = ok.length + ' / ' + rows.filter(Boolean).length;
    el.statIlvl.textContent = avg('ilvl') !== null ? avg('ilvl') : '–';
    el.statScore.textContent = avg('score') !== null ? avg('score') : '–';
    el.statRoles.textContent = ok.length ? roles.TANK + ' / ' + roles.HEALING + ' / ' + roles.DPS : '–';
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
    el.role.addEventListener('change', render);
    el.refresh.addEventListener('click', function () { cacheClear(); loadAll(true); });
    el.headers.forEach(function (th) {
      th.addEventListener('click', function () {
        const key = th.dataset.sort;
        if (sortKey === key) { sortDir = -sortDir; } else { sortKey = key; sortDir = (key === 'ilvl' || key === 'score') ? -1 : 1; }
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
