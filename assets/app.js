/* Community roster for World of Warcraft: Forever.
 * Reads data/characters.json (generated hourly from Blizzard's Armory)
 * and renders character cards. No API keys, no backend. */

(function () {
  'use strict';

  const DATA_URL = 'data/characters.json';
  const MAX_LEVEL = 60;
  const ICON_BASE = 'https://render.worldofwarcraft.com/eu/icons/56/';
  const FACTION_ICONS = {
    horde: ICON_BASE + 'achievement_pvp_h_h.jpg',
    alliance: ICON_BASE + 'achievement_pvp_a_a.jpg'
  };

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

  const ROLE_LABELS = { tank: 'Tank', healer: 'Healer', range: 'Range DPS', melee: 'Melee DPS' };
  const ROLE_ORDER = { tank: 0, healer: 1, range: 2, melee: 3 };
  const ROLE_ICONS = {
    tank: ICON_BASE + 'ability_warrior_defensivestance.jpg',
    healer: ICON_BASE + 'spell_holy_flashheal.jpg',
    range: ICON_BASE + 'ability_marksmanship.jpg',
    melee: ICON_BASE + 'ability_dualwield.jpg'
  };

  const FACTION_LABELS = { horde: 'Horda', alliance: 'Przymierze' };
  const RULESET_LABELS = { normal: 'Normal', pvp: 'PvP' };

  const el = {
    name: document.getElementById('community-name'),
    tagline: document.getElementById('community-tagline'),
    links: document.getElementById('community-links'),
    cards: document.getElementById('cards'),
    search: document.getElementById('search'),
    faction: document.getElementById('faction-filter'),
    role: document.getElementById('role-filter'),
    sort: document.getElementById('sort'),
    refresh: document.getElementById('refresh'),
    status: document.getElementById('status'),
    statCount: document.getElementById('stat-count'),
    statLevel: document.getElementById('stat-level'),
    statIlvl: document.getElementById('stat-ilvl'),
    statHorde: document.getElementById('stat-horde'),
    statAlliance: document.getElementById('stat-alliance'),
    statRoles: {
      tank: document.getElementById('stat-tank'),
      healer: document.getElementById('stat-healer'),
      range: document.getElementById('stat-range'),
      melee: document.getElementById('stat-melee')
    }
  };

  let config = null;
  let rows = [];
  let generatedAt = null;

  /* ---------- helpers ---------- */

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function img(src, className, alt) {
    const node = document.createElement('img');
    node.src = src;
    node.alt = alt || '';
    node.loading = 'lazy';
    node.decoding = 'async';
    if (className) node.className = className;
    return node;
  }

  function classIcon(slug) {
    return slug ? ICON_BASE + 'classicon_' + slug + '.jpg' : '';
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
      classSlug: c.classSlug || '',
      race: c.race || '',
      faction: c.faction || '',
      level: Number(c.level) || 0,
      ilvl: Number(c.ilvl) || 0,
      spec: c.spec || '',
      specIcon: c.specIcon || '',
      role: c.role || '',
      roleEstimated: c.roleSource === 'class',
      ruleset: c.ruleset || '',
      professions: Array.isArray(c.professions) ? c.professions : [],
      secondary: Array.isArray(c.secondaryProfessions) ? c.secondaryProfessions : [],
      avatar: c.avatar || '',
      render: c.render || '',
      background: c.background || '',
      lastUpdated: c.lastUpdated || '',
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
      setStatus(generatedAt ? 'Stan na ' + formatTime(generatedAt) : '');
    } catch (e) {
      rows = [];
      setStatus('Nie udało się wczytać danych (' + e.message + ').');
    }
    el.refresh.disabled = false;
    render();
  }

  /* ---------- rendering ---------- */

  function compare(a, b) {
    const ra = a.ok ? 0 : 1, rb = b.ok ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const key = el.sort.value;
    if (key === 'level' || key === 'ilvl') {
      if (b[key] !== a[key]) return b[key] - a[key];
      return a.name.localeCompare(b.name, 'pl');
    }
    if (key === 'class') {
      const c = a.cls.localeCompare(b.cls, 'pl');
      return c || b.level - a.level;
    }
    if (key === 'role') {
      const oa = ROLE_ORDER[a.role] != null ? ROLE_ORDER[a.role] : 9;
      const ob = ROLE_ORDER[b.role] != null ? ROLE_ORDER[b.role] : 9;
      return (oa - ob) || (b.level - a.level);
    }
    return (a.name || a.label).localeCompare(b.name || b.label, 'pl');
  }

  function matches(row) {
    const q = el.search.value.trim().toLowerCase();
    const faction = el.faction.value;
    const role = el.role.value;
    if (faction && row.faction !== faction) return false;
    if (role && row.role !== role) return false;
    if (!q) return true;
    const profs = row.professions.concat(row.secondary).map(function (p) { return p.name; }).join(' ');
    const hay = [row.name, row.label, row.cls, row.spec, row.race, profs, row.ruleset, ROLE_LABELS[row.role] || ''].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function missingCard(row) {
    const card = h('article', 'card missing');
    card.appendChild(h('div', 'silhouette', '?'));
    const name = h('div', 'card-name', row.name || row.label || '?');
    if (row.leader) name.appendChild(h('span', 'leader', '♛'));
    card.appendChild(name);
    card.appendChild(h('div', 'reason', row.pending ? 'uzupełnij nazwę postaci w roster.json' : (row.error || 'brak w Armory')));
    return card;
  }

  function professionRow(p) {
    const line = h('div', 'prof');
    line.appendChild(p.icon ? img(p.icon, '', p.name) : h('span'));
    const mid = h('div');
    mid.appendChild(h('div', 'prof-name', p.name || ''));
    if (p.skill != null && p.max) {
      const bar = h('div', 'prof-bar');
      const fill = h('i');
      fill.style.width = Math.max(0, Math.min(100, Math.round(100 * p.skill / p.max))) + '%';
      bar.appendChild(fill);
      mid.appendChild(bar);
    }
    line.appendChild(mid);
    line.appendChild(h('div', 'prof-skill', p.skill != null ? p.skill + (p.max ? ' / ' + p.max : '') : ''));
    return line;
  }

  function card(row) {
    if (!row.ok) return missingCard(row);

    const card = h('article', 'card');
    const color = CLASS_COLORS[row.cls] || 'var(--text)';
    card.style.setProperty('--class-color', color);

    const bg = h('div', 'card-bg');
    if (row.background) bg.style.backgroundImage = 'url("' + row.background + '")';
    card.appendChild(bg);

    if (row.render) card.appendChild(img(row.render, 'card-render', ''));

    const level = h('div', 'badge-level' + (row.level >= MAX_LEVEL ? ' max' : ''), String(row.level || '–'));
    level.appendChild(h('small', '', 'LVL'));
    level.title = 'Poziom ' + row.level;
    card.appendChild(level);

    if (FACTION_ICONS[row.faction]) {
      const f = img(FACTION_ICONS[row.faction], 'badge-faction ' + row.faction, FACTION_LABELS[row.faction]);
      f.title = FACTION_LABELS[row.faction];
      card.appendChild(f);
    }

    const body = h('div', 'card-body');

    const title = h('div', 'card-title');
    if (row.classSlug) {
      const ci = img(classIcon(row.classSlug), 'class-icon', row.cls);
      ci.title = row.cls;
      title.appendChild(ci);
    }
    const text = h('div');
    const name = h('div', 'card-name');
    name.style.color = color;
    const nameEl = row.url ? h('a', '', row.name) : h('span', '', row.name);
    if (row.url) { nameEl.href = row.url; nameEl.target = '_blank'; nameEl.rel = 'noopener'; nameEl.title = 'Profil w Armory'; }
    name.appendChild(nameEl);
    if (row.leader) {
      const crown = h('span', 'leader', '♛');
      crown.title = 'Lider';
      name.appendChild(crown);
    }
    text.appendChild(name);
    text.appendChild(h('div', 'card-sub', [row.race, row.cls].filter(Boolean).join(' · ')));
    if (row.label && row.label !== row.name) text.appendChild(h('div', 'card-label', row.label));
    title.appendChild(text);
    body.appendChild(title);

    const meta = h('div', 'card-meta');
    if (row.role && ROLE_LABELS[row.role]) {
      const chip = h('span', 'chip role ' + row.role + (row.roleEstimated ? ' estimated' : ''));
      chip.appendChild(img(ROLE_ICONS[row.role], '', ROLE_LABELS[row.role]));
      chip.appendChild(h('span', '', ROLE_LABELS[row.role]));
      chip.title = row.roleEstimated ? 'Rola oszacowana z klasy (brak specjalizacji)' : 'Rola na podstawie specjalizacji';
      meta.appendChild(chip);
    }
    if (row.spec) {
      const chip = h('span', 'chip');
      if (row.specIcon) chip.appendChild(img(row.specIcon, '', row.spec));
      chip.appendChild(h('span', '', row.spec));
      meta.appendChild(chip);
    }
    const ilvl = h('span', 'chip ilvl');
    ilvl.appendChild(h('span', 'chip-label', 'ilvl'));
    ilvl.appendChild(h('b', '', row.ilvl ? String(row.ilvl) : '–'));
    meta.appendChild(ilvl);
    if (row.ruleset) {
      const rs = h('span', 'chip ilvl');
      rs.appendChild(h('span', 'chip-label', RULESET_LABELS[row.ruleset] || row.ruleset));
      meta.appendChild(rs);
    }
    body.appendChild(meta);

    if (row.professions.length) {
      const profs = h('div', 'profs');
      row.professions.forEach(function (p) { profs.appendChild(professionRow(p)); });
      body.appendChild(profs);
    }
    if (row.secondary.length) {
      const sec = h('div', 'profs-secondary');
      row.secondary.forEach(function (p) {
        if (!p.icon) return;
        const i = img(p.icon, '', p.name);
        i.title = p.name + (p.skill != null ? ' ' + p.skill + (p.max ? '/' + p.max : '') : '');
        sec.appendChild(i);
      });
      body.appendChild(sec);
    }

    card.appendChild(body);
    return card;
  }

  function render() {
    const visible = rows.filter(matches).sort(compare);
    const frag = document.createDocumentFragment();
    if (!visible.length) {
      frag.appendChild(h('p', 'empty', rows.length ? 'Nic nie pasuje do filtra.' : 'Brak danych.'));
    }
    visible.forEach(function (row) { frag.appendChild(card(row)); });
    el.cards.replaceChildren(frag);
    renderSummary();
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
    el.statHorde.textContent = ok.length ? factions.horde : '–';
    el.statAlliance.textContent = ok.length ? factions.alliance : '–';
    const roles = { tank: 0, healer: 0, range: 0, melee: 0 };
    ok.forEach(function (r) { if (roles[r.role] !== undefined) roles[r.role] += 1; });
    Object.keys(roles).forEach(function (k) { el.statRoles[k].textContent = ok.length ? roles[k] : '–'; });
  }

  function renderHeader() {
    const c = (config && config.community) || {};
    el.name.textContent = c.name || 'Roster';
    document.title = (c.name ? c.name + ' – ' : '') + 'Roster';
    el.tagline.textContent = c.tagline || '';
    el.links.replaceChildren();
    if (c.discord) {
      const a = h('a', '', 'Discord');
      a.href = c.discord; a.target = '_blank'; a.rel = 'noopener';
      el.links.appendChild(a);
    }
  }

  /* ---------- boot ---------- */

  function bind() {
    el.search.addEventListener('input', render);
    el.faction.addEventListener('change', render);
    el.role.addEventListener('change', render);
    el.sort.addEventListener('change', render);
    el.refresh.addEventListener('click', function () { load(true); });
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
