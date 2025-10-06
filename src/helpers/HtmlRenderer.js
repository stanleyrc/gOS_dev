/* eslint-env browser */
'use strict';

import { slugify, parseNum, toPercentString, formatCoveragePair, normalizeAlterationType, tagClassForType, splitPillsList, escapeHtml, linkPmids } from './format';
import { eventAnchor, tierKey, fieldBase } from './reportKeys';

function escAttr(s) { return escapeHtml(String(s || '')); }
function inlineOrHrefCss(options = {}) {
  const css = typeof options.inlineCss === 'string' ? options.inlineCss : '';
  const href = typeof options.cssHref === 'string' && options.cssHref.trim() ? options.cssHref.trim() : '';
  if (css) return `  <style>\n${css}\n  </style>`;
  if (href) return `  <link rel="stylesheet" href="${escAttr(href)}" />`;
  return '';
}

// ADD below inlineOrHrefCss(...)
function inlineClientJs(options = {}) {
  const fmt = typeof options.inlineFormatJs === 'string' ? options.inlineFormatJs : '';
  const js = typeof options.inlineClientJs === 'string' ? options.inlineClientJs
           : (typeof options.inlineJs === 'string' ? options.inlineJs : '');
  if (!fmt && !js) return '';
  return `  <script>\n${fmt}\n${js}\n  </script>`;
}

function sizesFromName(name) {
  const m = String(name || '').match(/(\d{2,4}x\d{2,4})/);
  return m ? m[1] : '';
}


function inlineHeadIcons(options = {}) {
  const map = options.iconDataUrls || {};
  const out = [];
  const addPngIcon = (rel, filename, includeSizes = true) => {
    const data = map[filename];
    if (!data) return;
    const sizes = includeSizes ? sizesFromName(filename) : '';
    const sizesAttr = sizes ? ` sizes="${escAttr(sizes)}"` : '';
    out.push(`<link rel="${escAttr(rel)}" type="image/png"${sizesAttr} href="${escAttr(data)}">`);
  };
  addPngIcon('icon', 'favicon-32x32.png', true);
  addPngIcon('icon', 'favicon-16x16.png', true);
  addPngIcon('icon', 'android-chrome-192x192.png', true);
  addPngIcon('icon', 'android-chrome-512x512.png', true);
  if (map['apple-touch-icon.png']) out.push(`<link rel="apple-touch-icon" href="${escAttr(map['apple-touch-icon.png'])}">`);
  if (map['mstile-150x150.png']) out.push(`<meta name="msapplication-TileImage" content="${escAttr(map['mstile-150x150.png'])}">`);
  return out.length ? '  ' + out.join('\n  ') : '';
}

// ADD below inlineHeadIcons()
function getReportLogoUrl(options = {}) {
  return (
    options.logoDataUrl ||
    (options.iconDataUrls &&
      (options.iconDataUrls['android-chrome-192x192.png'] ||
       options.iconDataUrls['apple-touch-icon.png'] ||
       options.iconDataUrls['favicon-32x32.png'] ||
       options.iconDataUrls['android-chrome-512x512.png'])) ||
    ''
  );
}


// Safely serialize JSON for embedding in HTML
function serializeJsonForHtml(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// Inline the initial store as application/json
function inlineInitialStoreScript(storeObj) {
  const json = serializeJsonForHtml(storeObj || {});
  return `  <script type="application/json" id="gos-initial-state">\n${json}\n  </script>`;
}

function generateDocId() {
  try {
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }
  } catch (_) {}
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `doc-${ts}-${rnd}`;
}

function normalizeMsi(val) {
  const s = String(val || '').trim().toUpperCase();
  if (/MSI[-\s_]*H(IGH)?/.test(s) || s === 'MSI') return 'MSI-High';
  if (/MSI[-\s_]*L(OW)?/.test(s)) return 'MSI-Low';
  if (/MSS|STABLE/.test(s)) return 'MSS';
  return String(val || '');
}

function valueColorFor(key, raw) {
  const k = String(key || '').toLowerCase();
  const vStr = String(raw ?? '').trim();
  if (/(^|[\s-])tmb(\b|[^a-z])|tumor mutational burden/.test(k)) {
    const n = parseNum(vStr);
    if (n == null) return '';
    if (n < 5) return '#2e7d32';     // green (low)
    if (n < 20) return '#ef6c00';    // orange (medium)
    return '#c62828';                // red (high)
  }
  if (/hrd.*b1\+?2.*score/.test(k)) {
    const n = parseNum(vStr);
    if (n != null && n > 0.25) return '#c62828'; // red when significant
    return '';
  }
  if (/msi|microsatellite/.test(k)) {
    const s = normalizeMsi(vStr);
    if (/MSI-High/i.test(s)) return '#c62828'; // red
    if (/MSI-Low/i.test(s)) return '#ef6c00';  // orange
    if (/MSS/i.test(s)) return '#2e7d32';      // green
    return '';
  }
  return '';
}


function createMetadataItem(key, value) {
  if (value === null || value === undefined || value === '' || value === 'N/A') return '';
  const color = valueColorFor(key, value);
  const styleAttr = color ? ` style="color:${escAttr(color)}"` : '';
  return `<div class="metadata-item"><span class="metadata-key">${escapeHtml(key)}</span><span class="metadata-value"${styleAttr}>${escapeHtml(String(value))}</span></div>`;
}
function createMetadataBlock(title, data) {
  const obj = (data && typeof data === 'object') ? data : {};
  let itemsHtml = '';
  for (const [key, value] of Object.entries(obj)) {
    const item = createMetadataItem(key, value);
    if (item) itemsHtml += item;
  }
  if (!itemsHtml) return '';
  const anchor = slugify(title);
  return `<div class="metadata-section"><h3 id="${escAttr(anchor)}">${escapeHtml(title)}</h3>${itemsHtml}</div>`;
}
// deprecated group by genes
// function groupEventsByTierAndGene(events) {
//   const arr = Array.isArray(events) ? events : [];
//   return arr.reduce((acc, ev) => {
//     const tval = ev && (ev.tier != null ? ev.tier : ev.Tier);
//     const tier = tval != null ? String(tval) : 'Other';
//     const gene = ev && ev.gene ? String(ev.gene) : 'Unknown';
//     if (!acc[tier]) acc[tier] = {};
//     if (!acc[tier][gene]) acc[tier][gene] = [];
//     acc[tier][gene].push(ev);
//     return acc;
//   }, {});
// }



function parseGenomicFindings(summaryText) {
  const text = String(summaryText || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const entries = [];
  const seen = new Set();
  const add = (type, gene) => {
    const g = String(gene || '').trim().toUpperCase();
    const t = normalizeAlterationType(type || '');
    if (!g || !t) return;
    const key = `${t}::${g}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ type: t, gene: g });
  };

  // Fusions with explicit keywords
  let m;
  const fusionRe = /\b([A-Z0-9]{2,}(?:::[A-Z0-9]{2,}))\b[^.]*?\b(fusion|rearrang(e|ement)s?)\b/gi;
  while ((m = fusionRe.exec(text))) add('fusion', m[1]);

  // Common alteration patterns
  const specs = [
    { type: 'homdel',   re: /\b([A-Z][A-Z0-9]{1,})\b[^.]*?\b(homozygous\s+deletion|homdel)\b/gi },
    { type: 'amp',      re: /\b([A-Z][A-Z0-9]{1,})\b[^.]*?\b(amplification|amp)\b/gi },
    { type: 'del',      re: /\b([A-Z][A-Z0-9]{1,})\b[^.]*?\b(deletion|del)\b/gi },
    { type: 'gain',     re: /\b([A-Z][A-Z0-9]{1,})\b[^.]*?\bgain\b/gi },
    { type: 'loss',     re: /\b([A-Z][A-Z0-9]{1,})\b[^.]*?\bloss\b/gi },
    { type: 'mutation', re: /\b([A-Z][A-Z0-9]{1,})\b[^.]*?\b(mutation|mutant|mut)\b/gi }
  ];
  for (const { type, re } of specs) {
    while ((m = re.exec(text))) add(type, m[1]);
  }

  // Bare fusions without keyword
  const bareFusionRe = /\b([A-Z0-9]{2,}::[A-Z0-9]{2,})\b/gi;
  while ((m = bareFusionRe.exec(text))) add('fusion', m[1]);

  return entries;
}

function canonicalizeGenomicEntries(entries) {
  const arr = Array.isArray(entries) ? entries : [];
  return arr
    .map(({ type, gene, genes }) => {
      const label = (typeof genes === 'string' && genes) ? genes : gene;
      const tagLabel = String(type || '').trim();
      const geneLabel = String(label || '').trim();
      if (!tagLabel || !geneLabel) return null;
      return `[${tagLabel}],${geneLabel}`;
    })
    .filter(Boolean)
    .join('\n');
}

function createGenomicFindingsBlock(title, entries, storageKey) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const itemsHtml = entries.map(({ type, gene, genes }) => {
    const label = typeof genes === 'string' && genes ? genes : gene;
    const tagLabel = String(type || '').trim(); // use original type text from summary
    const tagHtml = `<span class="tag ${escAttr(tagClassForType(type))}">${escapeHtml(tagLabel)}</span>`;
    return `<div class="metadata-item">
    <span class="metadata-key">${tagHtml}</span>
    <span class="metadata-value">${escapeHtml(String(label || ''))}</span>
  </div>`;
  }).join('');
  const anchor = slugify(title);
  const keyAttr = escAttr(String(storageKey || ''));
  const initialPlain = canonicalizeGenomicEntries(entries);
  return `<div class="metadata-section">
    <div class="desc-block editable-field" data-storage-key="${keyAttr}">
      <div class="desc-title gf-title">
        <h3 id="${escAttr(anchor)}">${escapeHtml(title)}</h3>
        <button class="edit-btn" type="button" aria-label="Edit ${escAttr(title)}" data-role="edit-btn">✎</button>
      </div>
      <div class="desc-text"
           data-role="display"
           data-render="genomic"
           data-storage-key="${keyAttr}"
           data-initial="${escAttr(initialPlain)}">${itemsHtml}</div>
      <textarea class="edit-text"
                data-role="editor"
                data-storage-key="${keyAttr}"
                data-initial="${escAttr(initialPlain)}"
                aria-label="Edit ${escAttr(title)}"
                style="display:none;"></textarea>
    </div>
  </div>`;
}

 // Generic editable description block (title + hover-visible edit button + textarea editor)
function createEditableDescBlock(title, rawValue, storageKey) {
  const displayHtml = linkPmids(String(rawValue || ''));
  const key = String(storageKey || '');
  const titleSafe = escapeHtml(title);
  const keyAttr = escAttr(key);
  const plain = String(rawValue || '');
  return `
    <div class="desc-block editable-field" data-storage-key="${keyAttr}">
      <div class="desc-title">
        ${titleSafe}:
        <button class="edit-btn" type="button" aria-label="Edit ${titleSafe}" data-role="edit-btn">✎</button>
      </div>
      <div class="desc-text"
           style="white-space:pre-wrap;"
           data-role="display"
           data-render="pmid"
           data-storage-key="${keyAttr}"
           data-initial="${escAttr(plain)}">${displayHtml}</div>
      <textarea class="edit-text"
                data-role="editor"
                data-storage-key="${keyAttr}"
                data-initial="${escAttr(plain)}"
                aria-label="Edit ${titleSafe}"
                style="display:none;"></textarea>
    </div>`.trim();
}

// Per-alteration editable note block (plain text, click-to-edit, placeholder behavior)
function createEditableNoteBlock(title, rawValue, storageKey) {
  const displayHtml = linkPmids(String(rawValue || ''));
  const key = String(storageKey || '');
  const titleSafe = escapeHtml(title);
  const keyAttr = escAttr(key);
  const plain = String(rawValue || '');
  return `
    <div class="desc-block editable-field" data-storage-key="${keyAttr}">
      <div class="desc-title">
        ${titleSafe}:
        <button class="edit-btn" type="button" aria-label="Edit ${titleSafe}" data-role="edit-btn">✎</button>
      </div>
      <div class="desc-text"
           style="white-space:pre-wrap;"
           data-role="display"
           data-render="pmid"
           data-storage-key="${keyAttr}"
           data-initial="${escAttr(plain)}">${displayHtml}</div>
      <textarea class="edit-text"
                data-role="editor"
                data-storage-key="${keyAttr}"
                data-initial="${escAttr(plain)}"
                aria-label="Edit ${titleSafe}"
                style="display:none;"></textarea>
    </div>`.trim();
}

// --- Pills helpers (server-side rendering/edit blocks) ---

function pillsContainerHtml(list, kind) {
  const isRes = String(kind) === 'resistances';
  const containerClass = isRes ? 'resistance-tags' : 'therapeutics-tags';
  const pillClass = isRes ? 'resistance-tag' : 'therapeutic-tag';
  const pills = (list || []).map((label) =>
    `<span class="pill ${escAttr(pillClass)}">${escapeHtml(label)}</span>`
  ).join(' ');
  return `<div class="${escAttr(containerClass)}">${pills}</div>`;
}

function toPillsHtml(plain, kind) {
  const list = splitPillsList(plain);
  return pillsContainerHtml(list, kind);
}

function createEditablePillsBlock(title, rawValue, storageKey, kind) {
  const key = String(storageKey || '');
  const titleSafe = escapeHtml(title);
  const keyAttr = escAttr(key);
  const kindAttr = String(kind) === 'resistances' ? 'resistances' : 'therapeutics';
  const plain = splitPillsList(rawValue).join(', ');
  const displayHtml = toPillsHtml(plain, kindAttr);
  return `
  <div class="desc-block editable-field" data-storage-key="${keyAttr}">
    <div class="desc-title">
      ${titleSafe}:
      <button class="edit-btn" type="button" aria-label="Edit ${titleSafe}" data-role="edit-btn">✎</button>
    </div>
    <div class="desc-text"
         data-role="display"
         data-render="pills"
         data-pills-kind="${escAttr(kindAttr)}"
         data-storage-key="${keyAttr}"
         data-initial="${escAttr(plain)}">${displayHtml}</div>
    <textarea class="edit-text"
              data-role="editor"
              data-storage-key="${keyAttr}"
              data-initial="${escAttr(plain)}"
              aria-label="Edit ${titleSafe}"
              style="display:none;"></textarea>
  </div>`.trim();
}

function toTitle(report) {
  const p = report && report.patient ? report.patient : {};
  const id = p.caseId || '';
  const primary = p.primarySite || '';
  return `Clinical Evidence Report — ${id || primary || 'Patient'}`;
}


function buildPatientSection(report) {
  const p = report && report.patient ? report.patient : {};
  const m = (report && report.metadata) || {};
  const qc = m.coverage_qc || {};
  const patientData = {
    'Case ID': p.caseId,
    'Tumor Type': p.tumorType,
    'Primary Site': p.primarySite,
    ...( ((qc && qc.purity != null) || (m && m.purity != null))
      ? { 'Purity': (qc && qc.purity != null) ? qc.purity : m.purity }
      : {}
    ),
    ...( ((qc && qc.ploidy != null) || (m && m.ploidy != null))
      ? { 'Ploidy': String((qc && qc.ploidy != null) ? qc.ploidy : m.ploidy) }
      : {}
    ),
  };
  const biomarkerData = {
    'Tumor Mutational Burden': typeof p.tmb === 'number' ? `${p.tmb}` : '',
    'Microsatellite Status': p.msisensor && p.msisensor.msi_status ? normalizeMsi(p.msisensor.msi_status) : '',
    'HRD B1+2 Score': report && report.metadata && report.metadata.hrd && report.metadata.hrd.b1_2_score != null
      ? String(report.metadata.hrd.b1_2_score)
      : ''
  };
  const qcData = {
    ...(qc && (qc.tumor_median_coverage != null || qc.normal_median_coverage != null)
      ? { 'Median Coverage (tumor/normal)': formatCoveragePair(qc.tumor_median_coverage, qc.normal_median_coverage) }
      : {}),
    ...(qc && qc.greater_than_or_equal_to_50x != null ? { 'Coverage >= 50X': qc.greater_than_or_equal_to_50x } : {}),
    ...(qc && qc.percent_duplication != null ? { 'Percent Duplication': toPercentString(qc.percent_duplication) } : {}),
    ...(qc && qc.insert_size != null ? { 'Insert Size': String(qc.insert_size) } : {}),
    ...(qc && qc.mean_read_length != null ? { 'Mean Read Length': String(qc.mean_read_length) } : {}),
  };
  const summaryEntriesFromModel =
    (report && report.metadata && Array.isArray(report.metadata.summary_entries))
      ? report.metadata.summary_entries
      : [];
  const findings = summaryEntriesFromModel.length
    ? summaryEntriesFromModel.map(e => ({ type: e.type, genes: e.genes }))
    : parseGenomicFindings(
        (report && report.metadata && (report.metadata.originalSummary || report.metadata.summary)) || ''
      );
  const caseIdStr = p.caseId ? String(p.caseId) : '';
  const gfKey = `gos.genomic.${caseIdStr || 'unknown'}`;
  const genomicBlock = createGenomicFindingsBlock('Genomic Findings', findings, gfKey);
  return `
<h2 id="${escAttr(slugify('Overview'))}">Overview</h2>
<div class="metadata-grid">
  <div class="metadata-column">
    ${createMetadataBlock('Patient', patientData)}
    ${createMetadataBlock('Sequencing QC', qcData)}
  </div>
  <div class="metadata-column">
    ${createMetadataBlock('Biomarker Findings', biomarkerData)}
    ${genomicBlock}
  </div>
</div>
${buildTherapiesTable(report)}`.trim();
}

function buildNotesSection(report) {
  const caseId = report && report.patient && report.patient.caseId ? String(report.patient.caseId) : '';
  const storageKey = `gos.notes.${caseId || 'unknown'}`;
  return `
<h2 id="${escAttr(slugify('Notes'))}">Notes</h2>
${createEditableDescBlock('Notes', '', storageKey)}
<div class="notes-help">Notes are saved locally in your browser and stay on this device.</div>`.trim();
}

function buildTherapiesTable(report) {
  const entries = Array.isArray(report && report.therapies) ? report.therapies : [];

  // Group by gene (only if there are entries)
  const byGene = new Map();
  if (entries.length) {
    for (const e of entries) {
      const v = (e && e.variant) || {};
      const gene = String(v.gene_name || '').trim() || 'Unknown';
      const variant = String(v.variant || '').trim();
      const therapies = Array.isArray(v.therapies) ? v.therapies : [];
      const resistances = Array.isArray(v.resistances) ? v.resistances : [];
      const list = byGene.get(gene) || [];
      list.push({ variant, therapies, resistances });
      byGene.set(gene, list);
    }
  }

  // Build rows if we have initial entries; otherwise leave empty and hidden
  let rowsHtml = '';
  if (byGene.size) {
    for (const [gene, variants] of Array.from(byGene.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const blockRows = variants.map((v) => Math.max(1, Math.max(v.therapies.length, v.resistances.length)));
      const geneRowspan = blockRows.reduce((a, b) => a + b, 0);
      let genePrinted = false;

      variants.forEach((v) => {
        const n = Math.max(1, Math.max(v.therapies.length, v.resistances.length));
        for (let i = 0; i < n; i++) {
          const isStart = i === 0;
          const isEnd = i === n - 1;
          const trClass = `${isStart ? 'variant-group-start' : ''} ${isEnd ? 'variant-group-end' : ''}`.trim();
          rowsHtml += `<tr class="${escAttr(trClass)}">`;
          if (!genePrinted) {
            rowsHtml += `<td class="gene-cell" rowspan="${geneRowspan}">${escapeHtml(gene)}</td>`;
            genePrinted = true;
          }
          if (isStart) {
            rowsHtml += `<td class="variant-cell" rowspan="${n}">${escapeHtml(v.variant || '')}</td>`;
          }
          const therapy = v.therapies[i] ? escapeHtml(v.therapies[i]) : '';
          const resist = v.resistances[i] ? escapeHtml(v.resistances[i]) : '';
          rowsHtml += `<td>${therapy}</td><td>${resist}</td></tr>`;
        }
      });
    }
  }

  // Render the section and table always; hide if no rows initially
  const hiddenAttr = rowsHtml ? '' : ' style="display:none;"';
  return `<div class="metadata-section therapies-section"${hiddenAttr}>
  <h3 id="${escAttr(slugify('Therapies'))}">Therapies</h3>
  <table class="therapies-table">
    <thead>
      <tr>
        <th>Gene</th>
        <th>Variant</th>
        <th>Therapies</th>
        <th>Resistances</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</div>`;
}



// NEW: small, pure sub-renderers for alterations

function renderVariantHeader(v, caseId) {
  const tierStr = String(v.tier != null ? v.tier : v.Tier != null ? v.Tier : 'Other');
  const gene = String(v.gene || 'Unknown');
  const geneLabel = gene.replace('::', '-');
  const variantTitle = String(v.variant || v.Variant || '');
  const roles = Array.isArray(v.role) ? v.role : splitPillsList(v.role);
  const effectTag = v.effect ? `<span class="pill effect-pill">${escapeHtml(v.effect)}</span>` : '';
  const anchorId = eventAnchor(v.gene, variantTitle);
  const storageKey = tierKey(caseId, anchorId);

  let html = '';
  html += `<div class="variant-header">`;
  html += `<div class="gene-left">`;
  html += `<div class="tier-control">
      <span class="tier-indicator tier-${escAttr(tierStr)}" aria-hidden="true">${escapeHtml(tierStr)}</span>
      <!-- UI exposes Tier 3 / Exclude; Tier 3 items are not exported in the report body. -->
      <select class="tier-select" aria-label="Set tier for ${escAttr(geneLabel)} ${escAttr(variantTitle)}" data-storage-key="${escAttr(storageKey)}" data-default-tier="${escAttr(tierStr)}">
        <option value="1"${tierStr==='1'?' selected':''}>Tier 1</option>
        <option value="2"${tierStr==='2'?' selected':''}>Tier 2</option>
        <option value="3"${tierStr==='3'?' selected':''}>Tier 3 / Exclude</option>
      </select>
    </div>`;
  html += `<h3 class="gene-title">${escapeHtml(geneLabel)}</h3>`;
  if (variantTitle) {
    html += `<div class="variant-title">${escapeHtml(variantTitle)}</div>`;
  }
  html += `</div>`;
  html += `<div class="gene-right">`;
  if (roles.length) {
    html += roles.map((r) => `<span class="pill role-pill">${escapeHtml(r)}</span>`).join(' ');
  }
  if (effectTag) {
    html += (roles.length ? ' ' : '') + effectTag;
  }
  html += `</div></div>\n`;
  return html;
}

function renderVariantBody(v, fieldKeyBase) {
  const geneSummaryHtml = v.gene_summary
    ? createEditableDescBlock('Gene Summary', v.gene_summary, `${fieldKeyBase}.gene_summary`)
    : '';

  const summaryBlock = v.variant_summary
    ? createEditableDescBlock('Variant Summary', v.variant_summary, `${fieldKeyBase}.variant_summary`)
    : '';

  const effectDescBlock = v.effect_description
    ? createEditableDescBlock('Effect Description', v.effect_description, `${fieldKeyBase}.effect_description`)
    : '';

  const noteBlock = createEditableNoteBlock('Notes', v.notes || '', `${fieldKeyBase}.notes`);

  const metrics = [];
  if (v.VAF !== undefined) metrics.push(`<div class="metric-row"><span class="metric-label">VAF:</span><span class="metric-value monospace">${escapeHtml(String(v.VAF))}</span></div>`);
  if (v.estimated_altered_copies !== undefined) metrics.push(`<div class="metric-row"><span class="metric-label">Multiplicity:</span><span class="metric-value monospace">${escapeHtml(String(v.estimated_altered_copies))}</span></div>`);
  if (v.alt !== undefined) metrics.push(`<div class="metric-row"><span class="metric-label">Tumor Alt:</span><span class="metric-value monospace">${escapeHtml(String(v.alt))}</span></div>`);
  if (v.ref !== undefined) metrics.push(`<div class="metric-row"><span class="metric-label">Tumor Ref:</span><span class="metric-value monospace">${escapeHtml(String(v.ref))}</span></div>`);
  const metricsHtml = metrics.length ? `<div class="metrics-block">${metrics.join('')}</div>` : '';

  let html = '';
  html += `<div class="variant-body"><div class="variant-desc">`;
  html += `${geneSummaryHtml}${summaryBlock}${effectDescBlock}${noteBlock}`;
  html += `</div>${metricsHtml}</div>\n`;
  return html;
}

function renderVariantFooter(v, fieldKeyBase) {
  const therPlain = splitPillsList(v.therapeutics).join(', ');
  const resPlain = splitPillsList(v.resistances).join(', ');
  const therBlock = createEditablePillsBlock('Therapeutics', therPlain, `${fieldKeyBase}.therapeutics`, 'therapeutics');
  const resBlock = createEditablePillsBlock('Resistances', resPlain, `${fieldKeyBase}.resistances`, 'resistances');
  return `<div class="variant-footer">${therBlock}${resBlock}</div>\n`;
}

function renderVariantCard(v, caseId) {
  const tierStr = String(v.tier != null ? v.tier : v.Tier != null ? v.Tier : 'Other');
  const gene = String(v.gene || 'Unknown');
  const geneLabel = gene.replace('::', '-');
  const variantTitle = String(v.variant || v.Variant || '');
  const anchorId = eventAnchor(v.gene, v.variant || v.Variant);
  const fieldKeyBase = fieldBase(caseId, anchorId);

  const dataAttrs = ` data-gene="${escAttr(geneLabel)}" data-variant="${escAttr(variantTitle)}" data-tier="${escAttr(tierStr)}" data-default-tier="${escAttr(tierStr)}"`;

  let html = '';
  html += `\n<div class="variant-card" id="${escAttr(anchorId)}"${dataAttrs}>\n`;
  html += renderVariantHeader(v, caseId);
  html += renderVariantBody(v, fieldKeyBase);
  html += renderVariantFooter(v, fieldKeyBase);
  html += `</div>\n`;
  return html;
}

function buildAlterationsSection(report) {
  const all = Array.isArray(report && report.alterations) ? report.alterations : [];
  // Render/export only Tier 1 and Tier 2 variants.
  // Tier 3 variants are intentionally omitted from the report body because there can be too many,
  // but the UI still allows setting "Tier 3 / Exclude" to support downtiering/uptiering.
  const events = all.filter((e) => {
    const t = Number(e.Tier ?? e.tier);
    return Number.isFinite(t) && t < 3;
  });
  if (!events.length) return '';

  const sorted = [...events].sort((a, b) => {
    const ta = Number(a.Tier ?? a.tier ?? 99);
    const tb = Number(b.Tier ?? b.tier ?? 99);
    if (ta !== tb) return ta - tb;
    const ga = String(a.gene || '').localeCompare(String(b.gene || ''));
    if (ga !== 0) return ga;
    const va = String(a.variant || a.Variant || '').localeCompare(String(b.variant || b.Variant || ''));
    return va;
  });

  const caseId = (report && report.patient && report.patient.caseId) ? String(report.patient.caseId) : '';
  let html = `<h2 id="${escAttr(slugify('Alterations'))}">Alterations</h2>`;
  html += `\n<section id="alterations-section">`;
  html += `\n<div class="alterations-controls"><input type="search" id="alterations-filter" placeholder="Filter by gene…" aria-label="Filter alterations by gene" /></div>`;
  html += `\n<div class="alterations-list" data-case-id="${escAttr(caseId)}">`;
  html += `\n<div id="tier-1"></div>\n<div id="tier-2"></div>`;

  for (const v of sorted) {
    html += renderVariantCard(v, caseId);
  }

  html += `\n</div></section>`;
  return html;
}

function buildToc(report, options = {}) {
  const all = Array.isArray(report && report.alterations) ? report.alterations : [];
  // TOC lists only Tier 1 and Tier 2 variants (same filter as the report body).
  const events = all.filter((e) => {
    const t = Number(e.Tier ?? e.tier);
    return Number.isFinite(t) && t < 3;
  });
  const caseId = report && report.patient && report.patient.caseId ? report.patient.caseId : '';

  const hasAlterations = events.length > 0;

  // Group events by tier (string)
  const byTier = events.reduce((acc, ev) => {
    const t = String(ev.tier != null ? ev.tier : ev.Tier != null ? ev.Tier : 'Other');
    (acc[t] = acc[t] || []).push(ev);
    return acc;
  }, {});
  const tiers = Object.keys(byTier).sort((a, b) => Number(a) - Number(b));

  const logoUrl = getReportLogoUrl(options);
  let toc = `<div class="report-header">
  <h1>Report for ${escapeHtml(caseId || 'Patient')}</h1>
  ${logoUrl
    ? `<div class="report-brand" aria-label="gOS">
         <span class="brand-letter brand-g" aria-hidden="true">g</span>
         <img class="report-logo brand-logo" src="${escAttr(logoUrl)}" alt="gOS logo" />
         <span class="brand-letter brand-s" aria-hidden="true">S</span>
       </div>`
    : `<div class="report-brand-text" aria-label="gOS">gOS</div>`}
</div>
<ul id="toc-root">`;
  toc += `<li><a href="#${escAttr(slugify('Overview'))}">Overview</a></li>`;
  toc += `<li><a href="#${escAttr(slugify('Notes'))}">Notes</a></li>`;


  if (hasAlterations) {
    toc += `<li><a href="#${escAttr(slugify('Alterations'))}">Alterations</a><ul>`;
    tiers.forEach((tier) => {
      const tStr = String(tier);
      toc += `<li><a href="#tier-${escAttr(tStr)}">Tier ${escapeHtml(tStr)}</a><ul>`;
      const items = (byTier[tier] || []).slice().sort((a, b) => {
        const ga = String(a.gene || '').localeCompare(String(b.gene || ''));
        if (ga !== 0) return ga;
        return String(a.variant || a.Variant || '').localeCompare(String(b.variant || b.Variant || ''));
      });
      items.forEach((ev) => {
        const gene = String(ev.gene || 'Unknown').replace('::', '-');
        const variant = String(ev.variant || ev.Variant || '');
        const anchorId = eventAnchor(ev.gene, variant);
        const label = variant ? `${gene}: ${variant}` : gene;
        toc += `<li><a href="#${escAttr(anchorId)}">${escapeHtml(label)}</a></li>`;
      });
      toc += `</ul></li>`;
    });
    toc += `</ul></li>`;
  }

  toc += `</ul>`;
  return toc;
}

class HtmlRenderer {
  async render(report, options = {}) {
    const title = toTitle(report);
    const caseId = report && report.patient && report.patient.caseId
      ? String(report.patient.caseId)
      : '';
    const sections = [
      buildToc(report, options),
      buildPatientSection(report),
      buildNotesSection(report),
      buildAlterationsSection(report)
    ].filter(Boolean).join('\n\n');

    const docId = generateDocId();
    const initialRev = new Date().toISOString();
    // Only embed user changes (deltas). Initial state is intentionally empty.
    const initialStore =
      options && options.initialStore != null ? options.initialStore : {};

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  ${inlineHeadIcons(options)}
  ${inlineOrHrefCss(options)}
  <meta name="gos-doc-id" content="${escAttr(docId)}">
  <meta name="gos-case-id" content="${escAttr(caseId)}">
  <meta name="gos-rev" content="${escAttr(initialRev)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body class="is-initializing">
  <button id="save-report" type="button" aria-label="Save report">Save Report</button>
  <div class="container">
    ${sections}
  </div>
  <button id="reset-state" type="button" aria-label="Reset local data for this report">Reset</button>
  ${inlineInitialStoreScript(initialStore)}
  ${inlineClientJs(options)}
</body>
</html>`.trim();

    return {
      html,
      mimeType: 'text/html',
      extension: '.html',
      filename: options && options.filename ? String(options.filename) : undefined
    };
  }
}

export { HtmlRenderer };
