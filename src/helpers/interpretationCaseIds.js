export const buildCanonicalCaseIdResolver = (records = []) => {
  const sourceIds = new Map();
  const sourceIdsByPair = new Map();

  records.forEach((record) => {
    if (record?.caseReportId == null) return;
    const sourceId = `${record.caseReportId}`;
    sourceIds.set(sourceId, sourceId);
    if (record.pair == null) return;
    const pair = `${record.pair}`;
    if (!sourceIdsByPair.has(pair)) sourceIdsByPair.set(pair, new Set());
    sourceIdsByPair.get(pair).add(sourceId);
  });

  return (caseId) => {
    if (caseId == null) return caseId;
    const normalized = `${caseId}`;
    if (sourceIds.has(normalized)) return sourceIds.get(normalized);
    const pairMatches = sourceIdsByPair.get(normalized);
    return pairMatches?.size === 1 ? [...pairMatches][0] : normalized;
  };
};

const canonicalizeSet = (values, resolveCaseId) =>
  new Set(Array.from(values || [], resolveCaseId));

const canonicalizeMapOfSets = (values, resolveCaseId) =>
  new Map(
    Array.from(values || [], ([key, caseIds]) => [
      key,
      canonicalizeSet(caseIds, resolveCaseId),
    ]),
  );

export const canonicalizeInterpretationSummary = (summary = {}, records = []) => {
  const resolveCaseId = buildCanonicalCaseIdResolver(records);
  return {
    all: canonicalizeSet(summary.all, resolveCaseId),
    withTierChange: canonicalizeSet(summary.withTierChange, resolveCaseId),
    byAuthor: canonicalizeMapOfSets(summary.byAuthor, resolveCaseId),
    byGene: canonicalizeMapOfSets(summary.byGene, resolveCaseId),
  };
};

export const canonicalizeInterpretationCounts = (counts, records = []) => {
  const resolveCaseId = buildCanonicalCaseIdResolver(records);
  return Array.from(counts || []).reduce((canonicalCounts, [caseId, count]) => {
    const canonicalId = resolveCaseId(caseId);
    canonicalCounts.set(
      canonicalId,
      (canonicalCounts.get(canonicalId) || 0) + Number(count || 0),
    );
    return canonicalCounts;
  }, new Map());
};
