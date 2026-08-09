import { MyeloSeqDocxRenderer } from "./myeloSeqDocxRenderer";
import { MyeloSeqHtmlRenderer } from "./myeloSeqHtmlRenderer";
import { getUser } from './userAuth';
import { datasetHasField } from './browseScope';

/**
 * Builds a report structure from Redux state with merged interpretations
 * @param {Object} state - Redux state
 * @param {Object} mergedEvents - Events merged with interpretations from selectMergedEvents selector
 * @param {Array} selectedEventUids - Canonical event UIDs to include in the report
 * @returns {Object} Report structure suitable for the report renderers
 */
function buildReportFromMergedState(state, mergedEvents, selectedEventUids = []) {
  const ce = state?.CaseReport || {};
  const m = ce?.metadata || {};
  const dataset = state?.Settings?.dataset || state?.dataset || null;
  const hasField = (field) =>
    !dataset || !Array.isArray(dataset.fields) || datasetHasField(dataset, field);
  const fieldString = (field, value) =>
    hasField(field) ? String(value ?? '') : '';
  const fieldNumber = (field, value) =>
    hasField(field) ? parseNumber(value) : undefined;
  
  const patient = {
    caseId: String(ce?.id ?? m?.pair ?? ''),
    tumorType: fieldString(
      'tumor_type',
      m?.tumor_type ?? m?.tumorType ?? m?.tumor,
    ),
    tumorDetails: fieldString(
      'tumor_details',
      m?.tumor_details ?? m?.tumorDetails,
    ),
    disease: fieldString('disease', m?.disease),
    primarySite: fieldString(
      'primary_site',
      m?.primary_site ?? m?.primarySite,
    ),
    tmb: fieldNumber('tmb', m?.tmb?.score ?? m?.tmbScore ?? m?.tmb),
    msisensor: {
      msi_status: fieldString(
        'msisensor.score',
        m?.msiLabel ?? m?.msisensor?.label,
      ),
      score: fieldNumber(
        'msisensor.score',
        m?.msiScore ?? m?.msisensor?.score,
      ),
    },
  };

  // Use merged events which already have interpretations applied
  const alterationsRaw = Array.isArray(mergedEvents?.filteredEvents) ? mergedEvents.filteredEvents : [];
  const alterationsMapped = alterationsRaw.map(mapEvent);
  const selectedUids = new Set(
    Array.isArray(selectedEventUids) ? selectedEventUids : []
  );
  const alterations = alterationsMapped.filter(
    (alteration) => alteration.uid != null && selectedUids.has(alteration.uid)
  );

  // Get global notes from interpretations
  const globalNotesInterp = state?.Interpretations?.selected?.['GLOBAL_NOTES'];
  const globalNotesObj = globalNotesInterp ? state?.Interpretations?.byId?.[globalNotesInterp] : null;
  const globalNotes = globalNotesObj?.data?.notes || '';

  const report = {
    patient,
    dataset,
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
  const alt = ev?.alt ?? ev?.altCounts ?? ev?.tumorAlt ?? ev?.tumor_alt ?? ev?.alt_count;
  const ref = ev?.ref ?? ev?.refCounts ?? ev?.tumorRef ?? ev?.tumor_ref ?? ev?.ref_count;
  const explicitDepth = parseNumber(ev?.depth ?? ev?.Depth ?? ev?.coverage);
  const altCount = parseNumber(alt);
  const refCount = parseNumber(ref);
  const derivedDepth = altCount !== undefined && refCount !== undefined
    ? altCount + refCount
    : undefined;

  return {
    uid: ev?.uid,
    gene,
    variant,
    tier: tier != null ? String(tier) : undefined,
    type: ev?.type ?? ev?.vartype ?? ev?.variant_type,
    eventType: ev?.eventType,
    role: ev?.role,
    effect: ev?.effect,
    gene_summary: ev?.gene_summary,
    variant_summary: ev?.variant_summary,
    effect_description: ev?.effect_description,
    therapeutics: toArray(ev?.therapeutics),
    resistances: toArray(ev?.resistances),
    notes: ev?.notes || '',
    VAF: ev?.VAF ?? ev?.vaf,
    depth: explicitDepth ?? derivedDepth,
    transcript: ev?.transcript ?? ev?.Transcript ?? ev?.transcript_id,
    locus: ev?.locus ?? ev?.fusion_gene_coords ?? ev?.location ?? ev?.Genome_Location,
    estimated_altered_copies: ev?.estimated_altered_copies ?? ev?.estimatedAlteredCopies,
    alt,
    ref,
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

function buildAuthoredReport(state, mergedEvents, user, selectedEventUids = []) {
  return {
    ...buildReportFromMergedState(state, mergedEvents, selectedEventUids),
    author: user ? user.displayName : "Unknown Author",
  };
}

/**
 * Generates the HTML report without downloading
 * @param {Object} state - Redux state
 * @param {Object} mergedEvents - Events merged with interpretations
 * @param {Array} selectedEventUids - Canonical event UIDs to include
 * @returns {Promise<string>} The generated HTML string
 */
export async function previewReport(state, mergedEvents, selectedEventUids = []) {
  try {
    const report = buildAuthoredReport(
      state,
      mergedEvents,
      getUser(),
      selectedEventUids,
    );
    const renderer = new MyeloSeqHtmlRenderer();
    const result = await renderer.render(report);

    return result.html;
  } catch (error) {
    console.error("Failed to preview report:", error);
    throw error;
  }
}

/**
 * Exports the clinical report as a semantic DOCX file.
 * @param {Object} state - Redux state
 * @param {Object} mergedEvents - Events merged with interpretations
 * @param {Array} selectedEventUids - Canonical event UIDs to include
 * @returns {Promise<Object>} DOCX renderer result
 */
export async function exportReport(state, mergedEvents, selectedEventUids = []) {
  let anchor = null;
  let url = null;

  try {
    const report = buildAuthoredReport(
      state,
      mergedEvents,
      getUser(),
      selectedEventUids,
    );
    const renderer = new MyeloSeqDocxRenderer();
    const result = await renderer.render(report);
    url = URL.createObjectURL(result.blob);
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename || "report.docx";
    document.body.appendChild(anchor);
    anchor.click();
    return result;
  } catch (error) {
    console.error("Failed to export report:", error);
    throw error;
  } finally {
    try {
      if (anchor?.parentNode) anchor.parentNode.removeChild(anchor);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
}
