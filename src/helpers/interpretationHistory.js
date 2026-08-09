export const CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID =
  "__case-interpretation-import__";
export const CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID = "__global__";

function normalizeExactEventValue(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function getExactEventParts(event) {
  if (!event) return null;

  const alterationId = normalizeExactEventValue(
    event.alterationId ?? event.uid,
  );
  const gene = normalizeExactEventValue(event.gene);
  const variant = normalizeExactEventValue(event.variant ?? event.Variant);
  const variantType = normalizeExactEventValue(
    event.variant_type ?? event.type,
  );

  if (!alterationId || !gene || !variant || !variantType) return null;

  return [alterationId, gene, variant, variantType];
}

export function createInterpretationHistoryKey(interpretation) {
  return JSON.stringify([
    interpretation?.datasetId ?? null,
    interpretation?.caseId ?? null,
    interpretation?.alterationId ?? null,
    interpretation?.authorId ?? null,
  ]);
}

export function createExactEventKey(event) {
  const parts = getExactEventParts(event);
  return parts ? JSON.stringify(parts) : null;
}

export function deduplicateGlobalImportedInterpretations(interpretations) {
  const importedByAggregateId = new Map();
  const ordinaryInterpretations = [];
  (interpretations || []).forEach((interpretation) => {
    const aggregateId = interpretation?.source?.kind ===
      "case-interpretation-import"
      ? interpretation.source.aggregateId
      : null;
    if (aggregateId) {
      const existing = importedByAggregateId.get(aggregateId);
      const isCanonical =
        interpretation.datasetId ===
          CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID &&
        interpretation.caseId === CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID;
      const existingIsCanonical =
        existing?.datasetId ===
          CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID &&
        existing?.caseId === CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID;
      if (
        !existing ||
        (isCanonical && !existingIsCanonical) ||
        (isCanonical === existingIsCanonical &&
          createInterpretationHistoryKey(interpretation) >
            createInterpretationHistoryKey(existing))
      ) {
        importedByAggregateId.set(aggregateId, interpretation);
      }
    } else {
      ordinaryInterpretations.push(interpretation);
    }
  });
  return [
    ...importedByAggregateId.values(),
    ...ordinaryInterpretations,
  ];
}

export function getExactEventInterpretations(interpretations, event) {
  const eventKey = createExactEventKey(event);
  if (!eventKey) return [];

  const matches = (interpretations || []).filter(
    (interpretation) => createExactEventKey(interpretation) === eventKey,
  );
  return deduplicateGlobalImportedInterpretations(matches);
}

export function isCaseInterpretationImport(interpretation) {
  return interpretation?.source?.kind === "case-interpretation-import";
}

export function getInterpretationSourceCaseId(interpretation) {
  return isCaseInterpretationImport(interpretation) &&
    interpretation.source.caseId
    ? interpretation.source.caseId
    : interpretation?.caseId;
}

export function getInterpretationSourceDatasetId(interpretation) {
  return isCaseInterpretationImport(interpretation) &&
    interpretation.source.datasetId
    ? interpretation.source.datasetId
    : interpretation?.datasetId;
}

export function getEffectiveFrequency(interpretation) {
  if (!isCaseInterpretationImport(interpretation)) return 1;
  const frequency = interpretation?.frequency;
  return Number.isInteger(frequency) && frequency > 0 ? frequency : 1;
}

export function getTierCountsForInterpretations(interpretations) {
  const counts = { 1: 0, 2: 0, 3: 0 };

  (interpretations || []).forEach((interpretation) => {
    const tier = Number(interpretation?.data?.tier);
    if (![1, 2, 3].includes(tier)) return;
    counts[tier] += getEffectiveFrequency(interpretation);
  });

  return counts;
}
