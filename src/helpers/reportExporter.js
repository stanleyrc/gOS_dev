import { HtmlRenderer } from './HtmlRenderer';

/**
 * Builds a report structure from Redux state with merged interpretations
 * @param {Object} state - Redux state
 * @param {Object} mergedEvents - Events merged with interpretations from selectMergedEvents selector
 * @returns {Object} Report structure suitable for HtmlRenderer
 */
function buildReportFromMergedState(state, mergedEvents) {
  const ce = state?.CaseReport || {};
  const m = ce?.metadata || {};
  
  const patient = {
    caseId: String(ce?.id ?? m?.pair ?? ''),
    tumorType: String(m?.tumor_type ?? m?.tumorType ?? m?.tumor ?? ''),
    primarySite: String(m?.primary_site ?? m?.primarySite ?? ''),
    tmb: parseNumber(m?.tmb?.score ?? m?.tmbScore ?? m?.tmb),
    msisensor: {
      msi_status: String(m?.msiLabel ?? m?.msisensor?.label ?? ''),
      score: parseNumber(m?.msiScore ?? m?.msisensor?.score),
    },
  };

  // Use merged events which already have interpretations applied
  const alterationsRaw = Array.isArray(mergedEvents?.filteredEvents) ? mergedEvents.filteredEvents : [];
  const alterationsMapped = alterationsRaw.map(mapEvent);
  const alterations = alterationsMapped.filter((a) => a.tier === '1' || a.tier === '2');

  // Get global notes from interpretations
  const globalNotesInterp = state?.Interpretations?.selected?.['GLOBAL_NOTES'];
  const globalNotesObj = globalNotesInterp ? state?.Interpretations?.byId?.[globalNotesInterp] : null;
  const globalNotes = globalNotesObj?.data?.notes || '';

  const report = {
    patient,
    metadata: m,
    summary: String(m?.summary ?? ''),
    notes: globalNotes,
    alterations,
    therapies: buildTherapiesFromAlterations(alterations),
  };

  return report;
}

function parseNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function toStr(val) {
  return val == null ? '' : String(val);
}

function toArray(val) {
  if (Array.isArray(val)) return val.map(toStr).filter(Boolean);
  if (typeof val === 'string') return splitPillsList(val);
  return [];
}

function splitPillsList(val) {
  const str = String(val || '').trim();
  if (!str) return [];
  return str.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

function mapEvent(ev) {
  const gene = ev?.gene ?? ev?.Gene ?? '';
  const variant = ev?.variant ?? ev?.Variant ?? '';
  const tier = ev?.tier ?? ev?.Tier;
  return {
    id: ev?.uid ?? ev?.id,
    gene,
    variant,
    tier: tier != null ? String(tier) : undefined,
    role: ev?.role,
    effect: ev?.effect,
    gene_summary: ev?.gene_summary,
    variant_summary: ev?.variant_summary,
    effect_description: ev?.effect_description,
    therapeutics: toArray(ev?.therapeutics),
    resistances: toArray(ev?.resistances),
    notes: ev?.notes || '',
    VAF: ev?.VAF ?? ev?.vaf,
    estimated_altered_copies: ev?.estimated_altered_copies ?? ev?.estimatedAlteredCopies,
    alt: ev?.alt ?? ev?.altCounts ?? ev?.tumorAlt ?? ev?.tumor_alt ?? ev?.alt_count,
    ref: ev?.ref ?? ev?.refCounts ?? ev?.tumorRef ?? ev?.tumor_ref ?? ev?.ref_count,
  };
}

function buildTherapiesFromAlterations(alterations) {
  return (Array.isArray(alterations) ? alterations : [])
    .map(a => ({
      variant: {
        gene_name: toStr(a.gene),
        variant: toStr(a.variant),
        therapies: toArray(a.therapeutics),
        resistances: toArray(a.resistances),
      }
    }))
    .filter(v => v.variant.therapies.length || v.variant.resistances.length);
}

/**
 * Generates the HTML report without downloading
 * @param {Object} state - Redux state
 * @param {Object} mergedEvents - Events merged with interpretations
 * @returns {Promise<string>} The generated HTML string
 */
export async function previewReport(state, mergedEvents) {
  try {
    const gos_user = JSON.parse(localStorage.getItem('gOS_user') || 'null');
    const caseId = String(state?.CaseReport?.id || '');
    const interpretationsFiltered = Object.values(state.Interpretations?.byId || {}).filter(i => i.authorId === gos_user.userId && i.caseId === caseId);
    const report = buildReportFromMergedState(state, mergedEvents);
    report.author = gos_user ? gos_user.displayName : 'Unknown Author';
    report.interpretations = interpretationsFiltered;
    const renderer = new HtmlRenderer();
    const result = await renderer.render(report);
    
    return result.html;
  } catch (error) {
    console.error('Failed to preview report:', error);
    throw error;
  }
}

/**
 * Exports the clinical report as a static HTML file
 * @param {Object} state - Redux state
 * @param {Object} mergedEvents - Events merged with interpretations
 * @returns {Promise<void>}
 */
export async function exportReport(state, mergedEvents) {
  try {
    const gos_user = JSON.parse(localStorage.getItem('gOS_user') || 'null');
    const caseId = String(state?.CaseReport?.id || '');
    const interpretationsFiltered = Object.values(state.Interpretations?.byId || {}).filter(i => i.authorId === gos_user.userId && i.caseId === caseId);
    const report = buildReportFromMergedState(state, mergedEvents);
    report.author = gos_user ? gos_user.displayName : 'Unknown Author';
    report.interpretations = interpretationsFiltered;
    const renderer = new HtmlRenderer();
    const result = await renderer.render(report);

    // Download the HTML file
    const blob = new Blob([result.html], { type: result.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename || 'report.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export report:', error);
    throw error;
  }
}
