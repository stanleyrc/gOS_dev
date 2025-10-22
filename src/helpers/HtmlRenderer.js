/* eslint-env browser */
import { slugify, parseNum, toPercentString, formatCoveragePair, normalizeAlterationType, tagClassForType, splitPillsList, escapeHtml, linkPmids } from './format';

function escAttr(s) { return escapeHtml(String(s || '')); }

// Load logo as data URL
async function loadLogoAsDataUrl() {
  try {
    const logoPath = `${process.env.PUBLIC_URL || ''}/android-chrome-192x192.png`;
    const response = await fetch(logoPath);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Failed to load logo:', error);
    return '';
  }
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

function parseGenomicFindings(summaryText) {
  const text = String(summaryText || '').trim();
  if (!text) return [];
  const entries = [];
  const seen = new Set();
  const add = (type, gene) => {
  const g = String(gene || '').trim().toUpperCase();
  const originalType = String(type || '').trim();
  const t = normalizeAlterationType(originalType);
  if (!g || !t) return;
  const key = `${t}::${g}`;
  if (seen.has(key)) return;
  seen.add(key);
  entries.push({ type: originalType, gene: g });
  };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  for (const line of lines) {
    const parts = line.split(':').map(p => p.trim());
  if (parts.length >= 2) {
    const type = parts[0];
    const gene = parts[1];
    add(type, gene);
    }
}
  
  return entries;
}

function createGenomicFindingsBlock(title, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const itemsHtml = entries.map(({ type, gene, genes }) => {
    const label = typeof genes === 'string' && genes ? genes : gene;
    const tagLabel = String(type || '').trim();
    const tagHtml = `<span class="tag ${escAttr(tagClassForType(type))}">${escapeHtml(tagLabel)}</span>`;
    return `<div class="metadata-item">
    <span class="metadata-key">${tagHtml}</span>
    <span class="metadata-value">${escapeHtml(String(label || ''))}</span>
  </div>`;
  }).join('');
  const anchor = slugify(title);
  return `<div class="metadata-section">
    <div class="desc-block">
      <div class="desc-title gf-title">
        <h3 id="${escAttr(anchor)}">${escapeHtml(title)}</h3>
      </div>
      <div class="desc-text">${itemsHtml}</div>
    </div>
  </div>`;
}

function createStaticDescBlock(title, rawValue) {
  const displayHtml = linkPmids(String(rawValue || ''));
  const titleSafe = escapeHtml(title);
  return `
    <div class="desc-block">
      <div class="desc-title">${titleSafe}:</div>
      <div class="desc-text" style="white-space:pre-wrap;">${displayHtml}</div>
    </div>`.trim();
}

function pillsContainerHtml(list, kind) {
  const isRes = String(kind) === 'resistances';
  const containerClass = isRes ? 'resistance-tags' : 'therapeutics-tags';
  const pillClass = isRes ? 'resistance-tag' : 'therapeutic-tag';
  const pills = (list || []).map((label) =>
    `<span class="pill ${escAttr(pillClass)}">${escapeHtml(label)}</span>`
  ).join(' ');
  return `<div class="${escAttr(containerClass)}">${pills}</div>`;
}

function createStaticPillsBlock(title, rawValue, kind) {
  const titleSafe = escapeHtml(title);
  const kindAttr = String(kind) === 'resistances' ? 'resistances' : 'therapeutics';
  const list = splitPillsList(rawValue);
  const displayHtml = pillsContainerHtml(list, kindAttr);
  return `
  <div class="desc-block">
    <div class="desc-title">${titleSafe}:</div>
    <div class="desc-text">${displayHtml}</div>
  </div>`.trim();
}

function toTitle(report) {
  const p = report && report.patient ? report.patient : {};
  const id = p.caseId || '';
  const primary = p.primarySite || '';
  const author = report.author || '';
  return `Clinical Evidence Report — ${id || primary || 'Patient'}${author ? ` ${author}` : ''}`;
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
  const genomicBlock = createGenomicFindingsBlock('Genomic Findings', findings);
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
  const notesValue = report && report.notes ? report.notes : '';
  return `
<h2 id="${escAttr(slugify('Notes'))}">Notes</h2>
${createStaticDescBlock('Notes', notesValue)}`.trim();
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
  const rowsArray = [];
  if (byGene.size) {
    for (const [gene, variants] of Array.from(byGene.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const geneRows = variants.reduce((sum, v) => sum + (Math.max(v.therapies.length, v.resistances.length) || 1), 0);
      let geneCellAdded = false;
      for (const v of variants) {
        const therapies = v.therapies;
        const resistances = v.resistances;
        const n = Math.max(therapies.length, resistances.length) || 1;
        for (let i = 0; i < n; i++) {
          const therapy = therapies[i] ? escapeHtml(therapies[i]) : '';
          const resist = resistances[i] ? escapeHtml(resistances[i]) : '';
          let row = '';
          if (!geneCellAdded) {
            row += `<td rowspan="${geneRows}">${escapeHtml(gene)}</td>`;
            geneCellAdded = true;
          }
          if (i === 0) {
            row += `<td rowspan="${n}">${escapeHtml(v.variant || '')}</td>`;
          }
          row += `<td>${therapy}</td><td>${resist}</td>`;
          rowsArray.push(`<tr>${row}</tr>`);
        }
      }
    }
  }
  const rowsHtml = rowsArray.join('');

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

function renderVariantHeader(v) {
  const tierStr = String(v.tier != null ? v.tier : v.Tier != null ? v.Tier : 'Other');
  const gene = String(v.gene || 'Unknown');
  const geneLabel = gene.replace('::', '-');
  const variantTitle = String(v.variant || v.Variant || '');
  const roles = Array.isArray(v.role) ? v.role : splitPillsList(v.role);
  const effectTag = v.effect ? `<span class="pill effect-pill">${escapeHtml(v.effect)}</span>` : '';

  let html = '';
  html += `<div class="variant-header">`;
  html += `<div class="gene-left">`;
  html += `<div class="tier-control">
      <span class="tier-indicator tier-${escAttr(tierStr)}" aria-hidden="true">${escapeHtml(tierStr)}</span>
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

function renderVariantBody(v) {
  const geneSummaryHtml = v.gene_summary
    ? createStaticDescBlock('Gene Summary', v.gene_summary)
    : '';

  const summaryBlock = v.variant_summary
    ? createStaticDescBlock('Variant Summary', v.variant_summary)
    : '';

  const effectDescBlock = v.effect_description
    ? createStaticDescBlock('Effect Description', v.effect_description)
    : '';

  const noteBlock = v.notes ? createStaticDescBlock('Notes', v.notes) : '';

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

function renderVariantFooter(v) {
  const therPlain = splitPillsList(v.therapeutics).join(', ');
  const resPlain = splitPillsList(v.resistances).join(', ');
  const therBlock = createStaticPillsBlock('Therapeutics', therPlain, 'therapeutics');
  const resBlock = createStaticPillsBlock('Resistances', resPlain, 'resistances');
  return `<div class="variant-footer">${therBlock}${resBlock}</div>\n`;
}

function generateAnchorId(gene, variant) {
  const geneLabel = String(gene || '').replace('::', '-').trim();
  const variantTitle = String(variant || '').trim();
  const base = [geneLabel, variantTitle].filter(Boolean).join(' ');
  return slugify(base);
}

function renderVariantCard(v) {
  const tierStr = String(v.tier != null ? v.tier : v.Tier != null ? v.Tier : 'Other');
  const gene = String(v.gene || 'Unknown');
  const geneLabel = gene.replace('::', '-');
  const variantTitle = String(v.variant || v.Variant || '');
  const anchorId = generateAnchorId(v.gene, v.variant || v.Variant);

  const dataAttrs = ` data-gene="${escAttr(geneLabel)}" data-variant="${escAttr(variantTitle)}" data-tier="${escAttr(tierStr)}"`;

  let html = '';
  html += `\n<div class="variant-card" id="${escAttr(anchorId)}"${dataAttrs}>\n`;
  html += renderVariantHeader(v);
  html += renderVariantBody(v);
  html += renderVariantFooter(v);
  html += `</div>\n`;
  return html;
}

function buildAlterationsSection(report) {
  const all = Array.isArray(report && report.alterations) ? report.alterations : [];
  // Render only Tier 1 and Tier 2 variants
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

  let html = `<h2 id="${escAttr(slugify('Alterations'))}">Alterations</h2>`;
  html += `\n<section id="alterations-section">`;
  html += `\n<div class="alterations-list">`;

  let lastTier = 0;
  for (const v of sorted) {
    const t = Number(v.Tier ?? v.tier);
    if (t > lastTier && t <= 2) {
      html += `\n<div id="tier-${t}"></div>`;
      lastTier = t;
    }
    html += renderVariantCard(v);
  }

  html += `\n</div></section>`;
  return html;
}

function buildToc(report, logoDataUrl) {
  const all = Array.isArray(report && report.alterations) ? report.alterations : [];
  // TOC lists only Tier 1 and Tier 2 variants
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

  const authorName = report && report.author ? String(report.author) : '';
  const dateStr = new Date().toISOString().slice(0, 10);
  const watermark = authorName ? `<div style="text-align:left; color:#ccc; font-size:14px; margin-bottom:10px;">${escapeHtml(dateStr)} ${escapeHtml(authorName)}</div>` : '';

  let toc = watermark + `<div class="report-header">
  <h1>Report for ${escapeHtml(caseId || 'Patient')}</h1>
  ${logoDataUrl
    ? `<div class="report-brand" aria-label="gOS">
         <span class="brand-letter brand-g" aria-hidden="true">g</span>
         <img class="report-logo brand-logo" src="${escAttr(logoDataUrl)}" alt="gOS logo" />
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
        const anchorId = generateAnchorId(ev.gene, variant);
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

// Inline static CSS for the report
function getInlineCSS() {
  return `
/* Reset and base styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
  padding: 20px;
}

.container {
  max-width: 1000px;
  margin: 0 auto;
  background: white;
  padding: 40px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* Header */
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #1890ff;
}

.report-header h1 {
  font-size: 28px;
  color: #1890ff;
}

.report-brand-text {
  font-size: 32px;
  font-weight: bold;
  color: #1890ff;
}

.report-brand {
  display: flex;
  align-items: center;
  gap: 4px;
}

.brand-letter {
  font-size: 32px;
  font-weight: bold;
  color: #1890ff;
}

.report-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border: 2px solid #1890ff;
  border-radius: 50%;
  padding: 2px;
}

/* TOC */
#toc-root {
  list-style: none;
  margin-bottom: 40px;
  padding: 20px;
  background: #fafafa;
  border-radius: 4px;
}

#toc-root li {
  margin: 5px 0;
}

#toc-root ul {
  list-style: none;
  margin-left: 20px;
}

#toc-root a {
  color: #1890ff;
  text-decoration: none;
}

#toc-root a:hover {
  text-decoration: underline;
}

/* Sections */
h2 {
  font-size: 24px;
  margin: 30px 0 20px;
  color: #1890ff;
  border-bottom: 1px solid #e8e8e8;
  padding-bottom: 10px;
}

h3 {
  font-size: 18px;
  margin: 20px 0 10px;
  color: #333;
}

/* Metadata grid */
.metadata-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-bottom: 30px;
}

@media (max-width: 768px) {
  .metadata-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

.metadata-section {
  margin-bottom: 20px;
  background: #fafafa;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.metadata-item {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 12px 0;
  border-bottom: 1px solid #e0e0e0;
  align-items: center;
}

.metadata-item:last-child {
  border-bottom: none;
}

.metadata-key {
  font-weight: 600;
  color: #404040;
  font-size: 14px;
}

.metadata-value {
  color: #262626;
  font-size: 14px;
  text-align: right;
  font-weight: 500;
}

/* Therapies table */
.therapies-table {
  width: 100%;
  min-width: 700px;
  border-collapse: collapse;
  margin-top: 15px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.therapies-table th,
.therapies-table td {
  border: 1px solid #e8e8e8;
  padding: 12px;
  text-align: left;
  font-size: 14px;
}

.therapies-table th {
  background: #f0f2f5;
  font-weight: 600;
  color: #404040;
}

.therapies-table tbody tr:nth-child(even) {
  background: #fafafa;
}

.therapies-table tbody tr:hover {
  background: #e6f7ff;
}

/* Description blocks */
.desc-block {
  margin: 15px 0;
}

.desc-title {
  font-weight: 600;
  color: #595959;
  margin-bottom: 5px;
}

.desc-text {
  color: #262626;
  line-height: 1.6;
}

/* Pills / Tags */
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 5px;
}

.role-pill {
  background: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

.effect-pill {
  background: #fff1f0;
  color: #cf1322;
  border: 1px solid #ffa39e;
}

.therapeutic-tag {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

.resistance-tag {
  background: #fff1f0;
  color: #cf1322;
  border: 1px solid #ffa39e;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
}

.tag-mutation { background: #e6f7ff; color: #1890ff; }
.tag-amp { background: #fff1f0; color: #cf1322; }
.tag-del { background: #e6fffb; color: #13c2c2; }
.tag-homdel { background: #fff0f6; color: #eb2f96; }
.tag-fusion { background: #f9f0ff; color: #722ed1; }
.tag-gain { background: #fff7e6; color: #fa8c16; }
.tag-loss { background: #feffe6; color: #a0d911; }

/* Alterations */
#alterations-section {
  margin-top: 30px;
}

.alterations-list {
  margin-top: 20px;
}

.variant-card {
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  margin-bottom: 20px;
  background: white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.variant-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
}

.gene-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.tier-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tier-indicator {
  display: inline-block;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  text-align: center;
  line-height: 32px;
  font-weight: bold;
  color: white;
}

.tier-1 { background: #52c41a; }
.tier-2 { background: #1890ff; }
.tier-3 { background: #d9d9d9; }

.gene-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.variant-title {
  font-size: 14px;
  color: #595959;
}

.variant-body {
  padding: 20px;
  display: flex;
  gap: 30px;
}

.variant-desc {
  flex: 1;
}

.metrics-block {
  min-width: 200px;
  background: #fafafa;
  padding: 15px;
  border-radius: 4px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.metric-label {
  font-weight: 600;
  color: #595959;
}

.metric-value {
  color: #262626;
}

.monospace {
  font-family: 'Courier New', monospace;
}

.variant-footer {
  padding: 15px 20px;
  background: #fafafa;
  border-top: 1px solid #e8e8e8;
}

/* Print styles */
@media print {
  body {
    background: white;
    padding: 0;
  }
  
  .container {
    box-shadow: none;
    padding: 20px;
  }
  
  .variant-card {
    page-break-inside: avoid;
  }
}
`.trim();
}

class HtmlRenderer {
  async render(report, options = {}) {
    const title = toTitle(report);
    const caseId = report && report.patient && report.patient.caseId
      ? String(report.patient.caseId)
      : '';
    const authorName = report && report.author ? String(report.author) : '';
    
    // Load logo as data URL
    const logoDataUrl = await loadLogoAsDataUrl();
    
    const sections = [
      buildToc(report, logoDataUrl),
      buildPatientSection(report),
      buildNotesSection(report),
      buildAlterationsSection(report)
    ].filter(Boolean).join('\n\n');

    const interpretationsScript = report.interpretations && report.interpretations.length > 0 ? `<script type="application/json" id="interpretations-data">${JSON.stringify(report.interpretations)}</script>` : '';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${logoDataUrl ? `<link rel="icon" href="${escAttr(logoDataUrl)}" type="image/png">` : ''}
  <style>
${getInlineCSS()}
  </style>
</head>
<body>
  <div class="container">
    ${sections}
  </div>
  ${interpretationsScript}
</body>
</html>`.trim();

    return {
      html,
      mimeType: 'text/html',
      extension: '.html',
      filename: options && options.filename ? String(options.filename) : `report-${caseId || 'patient'}-${authorName}.html`
    };
  }
}

export { HtmlRenderer };
