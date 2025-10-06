/* Browser client logic injected into the HTML report at render time */
(function () {
  'use strict';
  // URL-based namespace helpers
  function nsInfo() {
    try {
      var m = document.querySelector('meta[name="gos-doc-id"]');
      var id = (m && m.getAttribute('content')) || '';
      id = String(id || '').trim();
      return {
        ns: id || 'no-doc-id',
        nsKey: function (k) { return '__gosdoc__' + (id || 'no-doc-id') + '__::' + String(k); }
      };
    } catch (e) {
      return { ns: 'no-doc-id', nsKey: function (k) { return '__gosdoc__no-doc-id__::' + String(k); } };
    }
  }

  // IndexedDB-backed async store with in-memory cache
  const AsyncStore = (function () {
    let db = null;
    const cache = new Map();
    const info = nsInfo();

    function openDb() {
      return new Promise(function (resolve, reject) {
        const req = indexedDB.open('gos_report', 1);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) {
            const st = db.createObjectStore('kv', { keyPath: 'k' });
            st.createIndex('by_ns', 'ns', { unique: false });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('idb open failed')); };
      });
    }

    async function init() {
      if (db) return;
      db = await openDb();
    }
    function store(mode) {
      const tx = db.transaction('kv', mode);
      return tx.objectStore('kv');
    }

    async function loadNamespace() {
      cache.clear();
      await init();
      return new Promise(function (resolve) {
        const st = store('readonly');
        const idx = st.index('by_ns');
        const req = idx.openCursor(IDBKeyRange.only(info.ns));
        req.onsuccess = function () {
          const c = req.result;
          if (c) {
            const v = (c.value && c.value.v) || '';
            const rawKey = (c.value && c.value.key) || '';
            cache.set(rawKey, v);
            c.continue();
          } else {
            resolve(new Map(cache));
          }
        };
        req.onerror = function () { resolve(new Map(cache)); };
      });
    }

    async function set(key, val) {
      await init();
      cache.set(String(key), String(val ?? ''));
      return new Promise(function (resolve) {
        const st = store('readwrite');
        st.put({ k: info.nsKey(key), ns: info.ns, key: String(key), v: String(val ?? '') });
        st.transaction.oncomplete = function () { resolve(); };
        st.transaction.onabort = st.transaction.onerror = function () { resolve(); };
      });
    }

    async function remove(key) {
      await init();
      cache.delete(String(key));
      return new Promise(function (resolve) {
        const st = store('readwrite');
        st.delete(info.nsKey(key));
        st.transaction.oncomplete = function () { resolve(); };
        st.transaction.onabort = st.transaction.onerror = function () { resolve(); };
      });
    }

    async function reset() {
      await init();
      cache.clear();
      return new Promise(function (resolve) {
        const st = store('readwrite');
        const idx = st.index('by_ns');
        const req = idx.openKeyCursor(IDBKeyRange.only(info.ns));
        req.onsuccess = function () {
          const c = req.result;
          if (c) {
            st.delete(c.primaryKey);
            c.continue();
          } else {
            resolve();
          }
        };
        req.onerror = function () { resolve(); };
      });
    }

    async function exportNs() {
      await init();
      if (cache.size === 0) await loadNamespace();
      const entries = {};
      cache.forEach((v, k) => { entries[String(k)] = String(v); });
      return { ns: info.ns, entries: entries };
    }

    async function importNs(data) {
      await init();
      let obj = data;
      if (typeof data === 'string') {
        try { obj = JSON.parse(data); } catch { obj = {}; }
      }
      const entries = (obj && obj.entries) || {};
      const keys = Object.keys(entries);
      if (!keys.length) return 0;
      return new Promise(function (resolve) {
        const st = store('readwrite');
        keys.forEach(function (k) {
          const v = String(entries[k] ?? '');
          cache.set(String(k), v);
          st.put({ k: info.nsKey(k), ns: info.ns, key: String(k), v: v });
        });
        st.transaction.oncomplete = function () { resolve(keys.length); };
        st.transaction.onabort = st.transaction.onerror = function () { resolve(0); };
      });
    }

    function getCached(key, fallback) {
      const v = cache.has(String(key)) ? cache.get(String(key)) : undefined;
      return v == null ? fallback : v;
    }

    function cacheMap() { return new Map(cache); }

    return { init, loadNamespace, set, remove, reset, exportNs, importNs, getCached, cacheMap, info };
  })();

  // Synchronous facade used by the rest of the code
  const Store = {
    get(key, fallback = '') { return AsyncStore.getCached(key, fallback); },
    set(key, value) { AsyncStore.set(key, value); },
    remove(key) { AsyncStore.remove(key); },
    // Extra utilities
    reset() { return AsyncStore.reset(); },
    serialize() { return AsyncStore.exportNs().then(obj => JSON.stringify(obj)); },
    deserialize(data) { return AsyncStore.importNs(data); }
  };

  // Shared helpers (browser-safe shim)
  var FMT = window.__gosFmt__ || {};

  // Read embedded JSON state (if present) and seed IndexedDB
  function readEmbeddedStateJson(root) {
    var r = root || document;
    var el =
      r.querySelector('script#gos-state-json[type="application/json"]') ||
      r.querySelector('script#gos-initial-state[type="application/json"]') ||
      r.querySelector('script[data-gos="state"][type="application/json"]');
    if (!el) return null;
    try {
      var txt = el.textContent || el.innerText || '';
      var raw = JSON.parse(String(txt || ''));
      var entries = null;

      // If the JSON itself is an array of {k, v}
      if (Array.isArray(raw)) {
        entries = {};
        raw.forEach(function (it) {
          if (it && it.k != null) entries[String(it.k)] = String(it.v ?? '');
        });
      } else if (raw && typeof raw === 'object') {
        // If it has an entries property (map or array)
        if (raw.entries && typeof raw.entries === 'object') {
          if (Array.isArray(raw.entries)) {
            entries = {};
            raw.entries.forEach(function (it) {
              if (it && it.k != null) entries[String(it.k)] = String(it.v ?? '');
            });
          } else {
            entries = raw.entries;
          }
        } else if (raw.k != null) {
          // Single {k, v} object
          entries = {};
          entries[String(raw.k)] = String(raw.v ?? '');
        }
      }

      return (entries && Object.keys(entries).length) ? { entries: entries } : null;
    } catch (_e) {
      return null;
    }
  }

  async function seedFromEmbeddedJson() {
    await AsyncStore.init();
    await AsyncStore.loadNamespace();

    var obj = readEmbeddedStateJson(document);
    if (!obj || !obj.entries || !Object.keys(obj.entries).length) return;

    // Only seed on first load for this doc-id (avoid overwriting user edits)
    var cache = AsyncStore.cacheMap();
    if (cache && cache.size > 0) return;

    await AsyncStore.reset(); // no-op if empty, safe if not
    await AsyncStore.importNs(obj);
    await AsyncStore.loadNamespace();
  }
 

  function getDisplayBaseline(el) {
    var init = (el && el.getAttribute) ? el.getAttribute('data-initial') : null;
    if (init != null) return String(init || '');
    var mode = (el && el.getAttribute) ? (el.getAttribute('data-render') || 'pmid') : 'pmid';
    if (mode === 'note') return '';
    if (mode === 'pills' || mode === 'genomic') {
      return String((el && el.getAttribute && el.getAttribute('data-initial')) || '');
    }
    return String((el && el.textContent) || '');
  }

  function buildBaselineMap(root) {
    var r = root || document;
    var map = new Map();

    // Tier controls: default is data-default-tier
    Array.from(r.querySelectorAll('.tier-select[data-storage-key]')).forEach(function (sel) {
      var key = sel.getAttribute('data-storage-key') || '';
      if (!key) return;
      var def = sel.getAttribute('data-default-tier');
      map.set(key, String(def || sel.value || ''));
    });

    // Editable display nodes
    Array.from(r.querySelectorAll('[data-role="display"][data-storage-key]')).forEach(function (disp) {
      var key = disp.getAttribute('data-storage-key') || '';
      if (!key || map.has(key)) return;
      map.set(key, getDisplayBaseline(disp));
    });

    // Notes fallback (ensure baseline exists)
    var notes = (r.getElementById && (r.getElementById('notes-textarea') || r.getElementById('notes-display'))) || null;
    if (notes) {
      var k = notes.getAttribute('data-storage-key') || 'gos.notes';
      if (!map.has(k)) map.set(k, '');
    }
    return map;
  }

  async function seedFromHtmlStore() {
    // Load current namespace to inspect existing DB state
    await AsyncStore.init();
    await AsyncStore.loadNamespace();
    var cache = AsyncStore.cacheMap();
    var dbRev = (cache && cache.has(REV_KEY)) ? String(cache.get(REV_KEY) || '') : '';
    var snap = readHtmlStore();
    var hasHtml = Object.keys(snap.entries).length > 0;
    var shouldSeed = false;
    if (hasHtml) {
      if (cache.size === 0) shouldSeed = true;
      else if (snap.rev && (!dbRev || dbRev < snap.rev)) shouldSeed = true; // ISO time compares lexicographically
    }
    if (!shouldSeed) return;
    await AsyncStore.reset(); // clear current doc-id namespace
    var baseline = buildBaselineMap();
    var diffs = {};
    Object.keys(snap.entries).forEach(function (k) {
      var v = String(snap.entries[k] ?? '');
      var base = baseline.has(k) ? String(baseline.get(k) ?? '') : undefined;
      if (base === undefined || v !== base) diffs[k] = v;
    });
    var payload = { entries: { ...diffs, [REV_KEY]: snap.rev || new Date().toISOString() } };
    await AsyncStore.importNs(payload);
    await AsyncStore.loadNamespace(); // refresh cache with seeded values
  }
 
  // --- PMID utilities ---
  function htmlEscape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.style && el.style.display === 'none') return false;
    try {
      var cs = window.getComputedStyle ? getComputedStyle(el) : null;
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    } catch (_) {}
    return true;
  }

  // Render: turn any "PMID: 1, 2" (with or without surrounding parentheses) into anchor links
  function pmidTokenToAnchors(text) {
    const esc = htmlEscape(String(text || ''));
    return esc.replace(/(PMID:\s*)([\d,\s]+)/gi, function (_m, prefix, ids) {
      const links = String(ids || '')
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean)
        .map(function (id) {
          const clean = id.replace(/\D/g, '');
          var href = (FMT.pmidToUrl ? FMT.pmidToUrl(clean) : ('https://pubmed.ncbi.nlm.nih.gov/' + clean + '/'));
          return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + htmlEscape(clean) + '</a>';
        })
        .join(', ');
      return prefix + links;
    });
  }

  // Editor canonical: convert any "PMID" forms to parens token "(PMID: ...)"
  function normalizeToEditorToken(text) {
    let s = String(text || '');
    s = s.replace(/\(\s*PMID:\s*([^)]+)\)/gi, '(PMID: $1)');
    return s;
  }

  // --- Pills utilities (for therapeutics/resistances) ---
  function pillsHtml(list, kind) {
    var isRes = String(kind) === 'resistances';
    var containerClass = isRes ? 'resistance-tags' : 'therapeutics-tags';
    var pillClass = isRes ? 'resistance-tag' : 'therapeutic-tag';
    var pills = list.map(function (label) {
      return '<span class="pill ' + pillClass + '">' + htmlEscape(label) + '</span>';
    }).join(' ');
    return '<div class="' + containerClass + '">' + pills + '</div>';
  }
  function renderPillsDisplay(el, text) {
    if (!el) return;
    var kind = el.getAttribute('data-pills-kind') || 'therapeutics';
    var fallback = String(text || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var list = (FMT.splitPillsList ? FMT.splitPillsList(text) : fallback);
    el.innerHTML = pillsHtml(list, kind);
  }
  function parseGenomicCanonical(text) {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    for (let ln of lines) {
      if (!ln) continue;
      const m = ln.match(/^\s*\[([^\]]+)\]\s*,\s*(.+)\s*$/);
      if (!m) continue;
      const tag = String(m[1] || '').trim();
      const genes = String(m[2] || '').trim();
      if (!tag || !genes) continue;
      out.push({ type: tag, label: genes });
    }
    return out;
  }
  function genomicHtmlFromPlain(text) {
    const items = parseGenomicCanonical(text);
    if (!items.length) return '';
    return items.map(function (it) {
      const cls = (FMT.tagClassForType ? FMT.tagClassForType(it.type) : 'tag-default');
      return '<div class="metadata-item">'
        + '<span class="metadata-key"><span class="tag ' + htmlEscape(cls) + '">' + htmlEscape(String(it.type)) + '</span></span>'
        + '<span class="metadata-value">' + htmlEscape(String(it.label)) + '</span>'
        + '</div>';
    }).join('');
  }
  function renderDisplayFromPlain(el, text) {
    if (!el) return;
    var mode = (el.getAttribute && el.getAttribute('data-render')) || 'pmid';
    if (mode === 'pills') {
      renderPillsDisplay(el, text);
    } else if (mode === 'note') {
      el.textContent = String(text || '');
    } else if (mode === 'genomic') {
      el.innerHTML = genomicHtmlFromPlain(text);
    } else {
      el.innerHTML = pmidTokenToAnchors(text);
    }
  }

  function updateNoteDisplayState(el, text) {
    if (!el) return;
    var val = String(text || '');
    if (!val) {
      el.classList.add('is-empty');
      if (!el.getAttribute('data-placeholder')) {
        el.setAttribute('data-placeholder', 'Click to add notes…');
      }
    } else {
      el.classList.remove('is-empty');
    }
  }
  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function splitPills(text) {
    var fallback = String(text || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return (FMT.splitPillsList ? FMT.splitPillsList(text) : fallback);
  }

  function getCardPillsPlain(card, kind) {
    var disp = card.querySelector('.desc-text[data-render="pills"][data-pills-kind="' + String(kind) + '"]');
    if (!disp) return '';
    var key = disp.getAttribute('data-storage-key') || '';
    var initial = disp.getAttribute('data-initial') || '';
    return Store.get(key, initial);
  }

  function updateTherapiesTable() {
    var section = document.querySelector('.therapies-section');
    var table = section ? section.querySelector('.therapies-table') : null;
    if (!section || !table) return;

    var list = document.querySelector('.alterations-list');
    if (!list) return;

    var cards = Array.from(list.querySelectorAll('.variant-card')).filter(function (card) {
      var sel = card.querySelector('.tier-select');
      var v = sel ? String(sel.value || '3') : String(card.getAttribute('data-tier') || '3');
      return v !== '3' && isVisible(card);
    });

    var byGene = {};
    cards.forEach(function (card) {
      var gene = card.getAttribute('data-gene') || 'Unknown';
      var variant = card.getAttribute('data-variant') || '';
      var therPlain = getCardPillsPlain(card, 'therapeutics');
      var resPlain = getCardPillsPlain(card, 'resistances');
      var therapies = splitPills(therPlain);
      var resistances = splitPills(resPlain);
      // Omit entries with no therapies and no resistances
      if (!therapies.length && !resistances.length) return;
      (byGene[gene] = byGene[gene] || []).push({ variant: variant, therapies: therapies, resistances: resistances });
    });

    var genes = Object.keys(byGene).sort(function (a, b) { return a.localeCompare(b); });
    var rowsHtml = '';

    genes.forEach(function (gene) {
      var variants = byGene[gene];
      var geneRowspan = variants.reduce(function (sum, v) {
        var n = Math.max(1, Math.max(v.therapies.length, v.resistances.length));
        return sum + n;
      }, 0);
      var genePrinted = false;

      variants.forEach(function (v) {
        var n = Math.max(1, Math.max(v.therapies.length, v.resistances.length));
        for (var i = 0; i < n; i++) {
          var isStart = i === 0;
          var isEnd = i === n - 1;
          var trClass = (isStart ? 'variant-group-start ' : '') + (isEnd ? 'variant-group-end' : '');
          rowsHtml += '<tr class="' + trClass.trim() + '">';
          if (!genePrinted) {
            rowsHtml += '<td class="gene-cell" rowspan="' + geneRowspan + '">' + htmlEscape(gene) + '</td>';
            genePrinted = true;
          }
          if (isStart) {
            rowsHtml += '<td class="variant-cell" rowspan="' + n + '">' + htmlEscape(v.variant || '') + '</td>';
          }
          var ther = v.therapies[i] ? htmlEscape(v.therapies[i]) : '';
          var resist = v.resistances[i] ? htmlEscape(v.resistances[i]) : '';
          rowsHtml += '<td>' + ther + '</td><td>' + resist + '</td></tr>';
        }
      });
    });

    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = rowsHtml;

    // Hide the entire section if no rows
    section.style.display = rowsHtml ? '' : 'none';
  }

  // --- Editable fields (per alteration) ---
  function initEditableFields() {
    const wrappers = Array.from(document.querySelectorAll('.editable-field'));
    wrappers.forEach(function (wrap) {
      const key = wrap.getAttribute('data-storage-key') || '';
      const disp = wrap.querySelector('[data-role="display"]');
      const ta = wrap.querySelector('[data-role="editor"]');
      const btn = wrap.querySelector('[data-role="edit-btn"]');
      if (!key || !disp || !ta || !btn) return;

      // Load initial
      const currentDisplayText = disp.textContent || '';
      const defaultPlain = disp.getAttribute('data-initial') || currentDisplayText;
      const initialPlain = Store.get(key, defaultPlain);
      const renderMode = disp.getAttribute('data-render') || 'pmid';
      // Set textarea (no PMID normalization for pills)
      ta.value = (renderMode === 'pills' || renderMode === 'genomic')
        ? initialPlain
        : normalizeToEditorToken(initialPlain);
      // Render display from stored value
      renderDisplayFromPlain(disp, ta.value);
      if (renderMode === 'note') {
        updateNoteDisplayState(disp, ta.value);
        disp.addEventListener('click', enterEdit);
      }

      function enterEdit() {
        disp.style.display = 'none';
        ta.style.display = 'block';
        ta.focus();
        try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (_e) {}
      }
      function saveAndRender() {
        const v = ta.value || '';
        Store.set(key, v);
        renderDisplayFromPlain(disp, v);
        if (renderMode === 'note') updateNoteDisplayState(disp, v);
        updateTherapiesTable();
      }
      const debouncedSave = debounce(saveAndRender, 300);
      function exitEdit() {
        saveAndRender();
        ta.style.display = 'none';
        disp.style.display = 'block';
      }
      btn.addEventListener('click', enterEdit);
      ta.addEventListener('input', debouncedSave);
      ta.addEventListener('change', saveAndRender);
      ta.addEventListener('blur', exitEdit);
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          exitEdit();
        }
      });
    });
  }

  function initNotes() {
    const ta = document.getElementById('notes-textarea');
    const disp = document.getElementById('notes-display');
    if (!ta || !disp) return;

    const key = ta.dataset.storageKey || disp.dataset.storageKey || 'gos.notes';
    const initial = Store.get(key, '');

    function updateDisplay(text) {
      const val = String(text || '');
      disp.textContent = val;
      if (!val) {
        disp.classList.add('is-empty');
        disp.setAttribute('data-placeholder', 'Click to add notes…');
      } else {
        disp.classList.remove('is-empty');
        disp.removeAttribute('data-placeholder');
      }
    }

    ta.value = initial;
    updateDisplay(initial);

    const save = debounce(() => {
      const v = ta.value || '';
      Store.set(key, v);
      updateDisplay(v);
    }, 300);

    function enterEdit() {
      disp.style.display = 'none';
      ta.style.display = 'block';
      ta.focus();
      const len = ta.value.length;
      try { ta.setSelectionRange(len, len); } catch {}
    }

    function exitEdit() {
      const v = ta.value || '';
      Store.set(key, v);
      updateDisplay(v);
      ta.style.display = 'none';
      disp.style.display = 'block';
    }

    disp.addEventListener('click', enterEdit);
    ta.addEventListener('input', save);
    ta.addEventListener('change', () => {
      const v = ta.value || '';
      Store.set(key, v);
      updateDisplay(v);
    });
    ta.addEventListener('blur', exitEdit);

    // Start in visual mode
    ta.style.display = 'none';
    disp.style.display = 'block';
  }

  async function initAll() {
    let revealed = false;
    function reveal() {
      if (revealed) return;
      revealed = true;
      try {
        const b = document.body || document.documentElement;
        const doReveal = () => { if (b && b.classList) b.classList.remove('is-initializing'); };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => requestAnimationFrame(doReveal));
        } else {
          setTimeout(doReveal, 0);
        }
      } catch {}
    }
    try {
      await AsyncStore.init();
      await seedFromEmbeddedJson();
      await AsyncStore.loadNamespace();
      initNotes();
      initEditableFields();
      initTierControls();
      updateTherapiesTable();
      initAlterationsFilter();
    } catch {}
    finally {
      reveal();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll().catch(function () {}); });
  } else {
    initAll().catch(function () {});
  }

  function fileSafeName(s) {
    return String(s || 'report')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 100) || 'report';
  }

  async function inlineStyles(rootEl) {
    const links = Array.from(
      (rootEl && rootEl.querySelectorAll)
        ? rootEl.querySelectorAll('link[rel="stylesheet"]')
        : []
    );
    await Promise.all(links.map(async (lnk) => {
      try {
        const href = lnk.getAttribute('href');
        if (!href) return;
        const abs = new URL(href, document.location.href).href;
        const res = await fetch(abs, { credentials: 'same-origin' });
        if (!res.ok) return;
        const css = await res.text();
        const style = document.createElement('style');
        style.textContent = css;
        lnk.replaceWith(style);
      } catch { /* ignore */ }
    }));
  }


  function getElVal(el) {
    if (!el) return '';
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return String(el.value || '');
    if (el.isContentEditable) return String(el.textContent || '');
    return String(el.textContent || '');
  }
  function setElVal(el, val) {
    if (!el) return;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') {
      el.value = String(val || '');
      return;
    }
    // Editable field display nodes render anchors
    if (el.getAttribute && el.getAttribute('data-role') === 'display') {
      renderDisplayFromPlain(el, val);
    } else {
      el.textContent = String(val || '');
    }
  }
  function collectStateFromDom() {
    const map = new Map();
    const nodes = document.querySelectorAll('[data-storage-key]');
    nodes.forEach((el) => {
      const key = el.getAttribute('data-storage-key') || '';
      if (!key) return;
      const current = getElVal(el);
      // Prefer form elements’ values if duplicates exist for same key
      if (!map.has(key) || /^(TEXTAREA|INPUT)$/.test((el.tagName || '').toUpperCase())) {
        map.set(key, current);
      }
    });
    return map;
  }
  function isValueSink(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return true;
    if (el.getAttribute && el.getAttribute('data-role') === 'display') return true;
    if (el.id === 'notes-display' || el.id === 'notes-textarea') return true;
    return false;
  }
  function applyStateToClone(rootEl, stateMap) {
    if (!rootEl || !stateMap) return;
    stateMap.forEach((val, key) => {
      const nodes = rootEl.querySelectorAll('[data-storage-key="' + key.replace(/"/g, '\\"') + '"]');
      nodes.forEach((el) => {
        if (!isValueSink(el)) return;
        setElVal(el, val);
        // Notes-specific visual affordance (generic-friendly fallback)
        if (el.id === 'notes-display') {
          if (!val) {
            el.classList.add('is-empty');
            el.setAttribute('data-placeholder', 'Click to add notes…');
          } else {
            el.classList.remove('is-empty');
            el.removeAttribute('data-placeholder');
          }
        } else if (el.classList && el.classList.contains('note-display')) {
          updateNoteDisplayState(el, val);
        }
      });
    });
  }
  function embedStateJsonIntoClone(rootEl) {
    try {
      // 1) Read current user-edited state from the live document
      const state = collectStateFromDom();

      // 2) Build baseline from the unmodified clone (server-rendered defaults)
      const baseline = buildBaselineMap(rootEl);

      // 3) Keep only keys that differ from baseline (space-efficient)
      const entries = {};
      state.forEach(function (val, key) {
        const k = String(key);
        const v = String(val || '');
        const base = baseline.has(k) ? String(baseline.get(k) ?? '') : undefined;
        if (base === undefined || v !== base) {
          entries[k] = v;
        }
      });

      // 4) Apply state to clone so the saved HTML reflects user edits immediately
      applyStateToClone(rootEl, state);

      // 5) Embed the diff JSON
      const head = rootEl.querySelector('head') || rootEl;
      const doc = head.ownerDocument || document;

      Array.from(head.querySelectorAll('script#gos-state-json')).forEach(function (n) {
        try { n.remove(); } catch (_e) { if (n.parentNode) n.parentNode.removeChild(n); }
      });

      const script = doc.createElement('script');
      script.setAttribute('type', 'application/json');
      script.setAttribute('id', 'gos-state-json');
      script.textContent = JSON.stringify({ entries: entries });
      head.appendChild(script);
    } catch (_e) { /* ignore embed errors */ }
  }
  function generateDocId() {
    try { if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); } catch (e) {}
    try {
      var arr = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(arr);
      var hex = Array.from(arr).map(function (b) { return (b + 256).toString(16).slice(1); }).join('');
      return 'doc-' + hex;
    } catch (e2) {
      return 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
  }
  function ensureDocIdMeta(headEl) {
    var m = headEl.querySelector('meta[name="gos-doc-id"]');
    var id = (m && m.getAttribute('content')) || '';
    if (!id) {
      id = generateDocId();
      var meta = document.createElement('meta');
      meta.setAttribute('name', 'gos-doc-id');
      meta.setAttribute('content', id);
      headEl.appendChild(meta);
    }
    return id;
  }

  function setDocIdMeta(headEl, id) {
    if (!headEl) return '';
    var m = headEl.querySelector('meta[name="gos-doc-id"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'gos-doc-id');
      headEl.appendChild(m);
    }
    m.setAttribute('content', String(id || ''));
    return String(id || '');
  }

  function byAttr(a, b, attr) {
    const sa = String(a.getAttribute(attr) || '').toLowerCase();
    const sb = String(b.getAttribute(attr) || '').toLowerCase();
    return sa.localeCompare(sb);
  }

  function classifyTierSelect(sel) {
    if (!sel) return;
    const v = String(sel.value || sel.getAttribute('data-default-tier') || '');
    const ctrl = sel.closest && sel.closest('.tier-control');
    const ind = ctrl ? ctrl.querySelector('.tier-indicator') : null;
    if (ind) {
      ind.classList.remove('tier-1', 'tier-2', 'tier-3');
      ind.classList.add('tier-' + v);
      ind.textContent = v;
    }
  }

  function setExcludedClass(card, tierVal) {
    if (!card) return;
    if (String(tierVal) === '3') card.classList.add('is-excluded');
    else card.classList.remove('is-excluded');
  }

  function ensureTierAnchors(root) {
    const r = root || document;
    const list = r.querySelector('.alterations-list');
    if (!list) return;
    let a1 = r.querySelector('#tier-1');
    let a2 = r.querySelector('#tier-2');
    let a3 = r.querySelector('#tier-3');           // ADD
    if (!a1) { a1 = (r.createElement ? r.createElement('div') : document.createElement('div')); a1.id = 'tier-1'; list.insertBefore(a1, list.firstChild); }
    if (!a2) { a2 = (r.createElement ? r.createElement('div') : document.createElement('div')); a2.id = 'tier-2'; list.appendChild(a2); }
    if (!a3) { a3 = (r.createElement ? r.createElement('div') : document.createElement('div')); a3.id = 'tier-3'; list.appendChild(a3); } // ADD
  }

  function reorderAlterations(root) {
    const r = root || document;
    const list = r.querySelector('.alterations-list');
    if (!list) return;

    const cards = Array.from(list.querySelectorAll('.variant-card')).filter(isVisible);
    if (!cards.length) return;

    const getTier = (card) => {
      const sel = card.querySelector('.tier-select');
      const v = sel ? sel.value : (card.getAttribute('data-tier') || card.getAttribute('data-default-tier') || '3');
      return Number(v);
    };

    const nonExcluded = cards.filter((c) => getTier(c) !== 3);
    const excluded = cards.filter((c) => getTier(c) === 3);

    const sortFn = (a, b) => {
      const ta = getTier(a);
      const tb = getTier(b);
      if (ta !== tb) return ta - tb;
      const g = byAttr(a, b, 'data-gene');
      if (g !== 0) return g;
      return byAttr(a, b, 'data-variant');
    };
    nonExcluded.sort(sortFn);
    excluded.sort((a, b) => byAttr(a, b, 'data-gene') || byAttr(a, b, 'data-variant'));

    ensureTierAnchors(r);
    const a1 = r.querySelector('#tier-1');
    const a2 = r.querySelector('#tier-2');
    const a3 = r.querySelector('#tier-3'); // ADD

    cards.forEach((c) => { if (c.parentNode === list) list.removeChild(c); });

    if (a1 && a1.parentNode !== list) list.insertBefore(a1, list.firstChild);
    if (a2 && a2.parentNode !== list) list.appendChild(a2);

    const tier1 = nonExcluded.filter((c) => getTier(c) === 1);
    const tier2 = nonExcluded.filter((c) => getTier(c) === 2);

    let ref = a1 ? a1.nextSibling : list.firstChild;
    tier1.forEach((c) => { list.insertBefore(c, ref); ref = c.nextSibling; });

    if (a2 && a2.parentNode === list) list.insertBefore(a2, ref);

    ref = a2 ? a2.nextSibling : list.firstChild;
    tier2.forEach((c) => { list.insertBefore(c, ref); ref = c.nextSibling; });

    // Place Tier 3 anchor before excluded cards
    if (a3) { list.insertBefore(a3, ref || null); } // ADD
    excluded.forEach((c) => list.appendChild(c));
  }

  function updateAlterationsToc(root) {
    const r = root || document;
    const toc = r.querySelector('#toc-root');
    const list = r.querySelector('.alterations-list');
    if (!toc || !list) return;

    const altLink = toc.querySelector('a[href="#alterations"]') || toc.querySelector('a[href="#' + 'alterations' + '"]');
    if (!altLink) return;
    const altLi = altLink.closest('li');
    if (!altLi) return;

    let sub = altLi.querySelector('ul');
    if (!sub) {
      sub = (r.createElement ? r.createElement('ul') : document.createElement('ul'));
      altLi.appendChild(sub);
    }

    const cards = Array.from(list.querySelectorAll('.variant-card'));

    const byTier = { '1': [], '2': [], '3': [] };
    cards.forEach((c) => {
      const sel = c.querySelector('.tier-select');
      const t = sel ? String(sel.value || '3') : String(c.getAttribute('data-tier') || '3');
      if (t === '1' || t === '2' || t === '3') byTier[t].push(c);
    });

    const mkTier = (t, arr) => {
      if (!arr.length) return '';
      const items = arr.map((c) => {
        const id = c.getAttribute('id') || '';
        const gene = c.getAttribute('data-gene') || 'Unknown';
        const variant = c.getAttribute('data-variant') || '';
        const label = variant ? (gene + ': ' + variant) : gene;
        return '<li><a href="#' + id + '">' + label + '</a></li>';
      }).join('');
      return '<li><a href="#tier-' + t + '">Tier ' + t + '</a><ul>' + items + '</ul></li>';
    };

    const tier1Html = mkTier('1', byTier['1']);
    const tier2Html = mkTier('2', byTier['2']);
    const tier3Html = byTier['3'].length ? '<li><a href="#tier-3">Tier 3</a></li>' : '';
    sub.innerHTML = tier1Html + tier2Html + tier3Html;
  }

  function applyAlterationsFilter(root) {
    const r = root || document;
    const input = r.getElementById('alterations-filter');
    const list = r.querySelector('.alterations-list');
    if (!input || !list) return;
    const term = String(input.value || '').trim().toLowerCase();
    const cards = Array.from(list.querySelectorAll('.variant-card'));
    cards.forEach(function (card) {
      const gene = String(card.getAttribute('data-gene') || '').toLowerCase();
      const show = !term || gene.indexOf(term) !== -1;
      card.style.display = show ? '' : 'none';
    });
    updateAlterationsToc(r);
    updateTherapiesTable();
  }

  function initAlterationsFilter() {
    const input = document.getElementById('alterations-filter');
    if (!input) return;
    const onInput = debounce(function () { applyAlterationsFilter(document); }, 150);
    input.addEventListener('input', onInput);
    // Initial apply (handles persisted markup or empty term)
    applyAlterationsFilter(document);
  }
 
  function initTierControls() {
    const list = document.querySelector('.alterations-list');
    if (!list) return;
    const caseId = list.getAttribute('data-case-id') || '';
    const cards = Array.from(list.querySelectorAll('.variant-card'));

    cards.forEach((card) => {
      const sel = card.querySelector('.tier-select');
      if (!sel) return;
      const key = sel.getAttribute('data-storage-key') || ('gos.tier.' + caseId + '.' + card.id);
      const defVal = sel.getAttribute('data-default-tier') || (card.getAttribute('data-tier') || '3');
      const stored = Store.get(key, defVal);
      sel.value = stored;
      classifyTierSelect(sel);
      card.setAttribute('data-tier', String(sel.value));
      setExcludedClass(card, sel.value);

      sel.addEventListener('change', () => {
        const v = String(sel.value || '3');
        Store.set(key, v);
        classifyTierSelect(sel);
        card.setAttribute('data-tier', v);
        setExcludedClass(card, v);
        reorderAlterations(document);
        updateAlterationsToc(document);
        updateTherapiesTable();
      });
    });

    reorderAlterations(document);
    updateAlterationsToc(document);
    updateTherapiesTable();
  }

  async function saveReport() {
    try {
      const clone = document.documentElement.cloneNode(true);
      // Ensure saved HTML starts hidden to avoid flash on reopen
      const cb = clone.querySelector('body') || clone;
      if (cb && cb.classList) cb.classList.add('is-initializing');
      // Inline styles
      await inlineStyles(clone);
      // Give the saved copy an independent namespace
      const head = clone.querySelector('head') || clone;
      setDocIdMeta(head, generateDocId());
      // Embed state as JSON script and ensure the visible text reflects it
      embedStateJsonIntoClone(clone);

      // Apply tier state to clone: reorder and remove excluded before saving
      try {
        reorderAlterations(clone);
        // Remove excluded cards entirely from saved HTML
        const list = clone.querySelector('.alterations-list');
        if (list) {
          Array.from(list.querySelectorAll('.variant-card')).forEach((card) => {
            const sel = card.querySelector('.tier-select');
            const v = sel ? String(sel.value || '3') : String(card.getAttribute('data-tier') || '3');
            if (v === '3') card.remove();
          });
          // Clean up TOC to reflect removals
          updateAlterationsToc(clone);
          // Ensure anchors still present
          ensureTierAnchors(clone);
        }
      } catch { /* ignore clone reorder errors */ }

      // Serialize and download
      const html = '<!DOCTYPE html>\n' + (clone.outerHTML || '');
      const filename = fileSafeName(document.title || 'report') + '.html';
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (err) {
      try { console.error('Save report failed:', err); } catch {}
      alert('Sorry, failed to save the report.');
    }
  }

  const saveBtn = document.getElementById('save-report');
  if (saveBtn) saveBtn.addEventListener('click', () => { saveReport().catch(() => {}); });

  async function resetLocalState() {
    try {
      const ok = window.confirm(
        'This will clear all saved edits for this report on this device. Continue?'
      );
      if (!ok) return;
      await AsyncStore.reset(); // clears only the current report namespace (doc-id)
      // Reload to reinitialize UI from defaults
      window.location.reload();
    } catch (_e) {
      try { alert('Failed to reset local data.'); } catch (_) {}
    }
  }
  const resetBtn = document.getElementById('reset-state');
  if (resetBtn) resetBtn.addEventListener('click', () => { resetLocalState().catch(() => {}); });

  // Expose for future modules if needed without polluting global scope widely
  window.__gosStore__ = window.__gosStore__ || Store;
})();
