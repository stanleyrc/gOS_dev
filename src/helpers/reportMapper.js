import { splitPillsList } from './format';

function toStr(val) { return val == null ? '' : String(val); }
function toNum(val) { const n = Number(val); return Number.isFinite(n) ? n : undefined; }
function toArray(val) {
  if (Array.isArray(val)) return val.map(toStr).filter(Boolean);
  if (typeof val === 'string') return splitPillsList(val);
  return [];
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
    role: ev?.role,                      // string or array is fine; HtmlRenderer handles both
    effect: ev?.effect,
    gene_summary: ev?.gene_summary,
    variant_summary: ev?.variant_summary,
    effect_description: ev?.effect_description,
    therapeutics: toArray(ev?.therapeutics),
    resistances: toArray(ev?.resistances),
    VAF: ev?.VAF ?? ev?.vaf,            // support both casings
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

export function buildReportFromState(state) {
  const ce = state?.CaseReport || {};
  const fe = state?.FilteredEvents || {};
  const m = ce?.metadata || {};

  const patient = {
    caseId: toStr(ce?.id ?? m?.pair),
    tumorType: toStr(m?.tumor_type ?? m?.tumorType ?? m?.tumor),
    primarySite: toStr(m?.primary_site ?? m?.primarySite),
    tmb: toNum(m?.tmb?.score ?? m?.tmbScore ?? m?.tmb),
    msisensor: {
      msi_status: toStr(m?.msiLabel ?? m?.msisensor?.label),
      score: toNum(m?.msiScore ?? m?.msisensor?.score),
    },
  };

  const alterationsRaw = Array.isArray(fe?.filteredEvents) ? fe.filteredEvents : [];
  const alterationsMapped = alterationsRaw.map(mapEvent);
  const alterations = alterationsMapped.filter((a) => a.tier === '1' || a.tier === '2');

  const report = {
    patient,
    metadata: m,
    summary: toStr(m?.summary),
    alterations,
    therapies: buildTherapiesFromAlterations(alterations),
  };

  // Optional: if you have pre-parsed genomic summary entries on metadata, pass them through
  // report.metadata.summary_entries = Array.isArray(m?.summary_entries) ? m.summary_entries : undefined;

  return report;
}
