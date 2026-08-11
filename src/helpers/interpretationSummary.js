import {
  getInterpretationSourceCaseId,
  getInterpretationSourceDatasetId,
} from "./interpretationHistory";

const idsMatch = (left, right) =>
  left != null && right != null && `${left}` === `${right}`;

const hasTierChange = (interpretation) =>
  interpretation?.hasTierChange === true ||
  interpretation?.hasTierChange === "true" ||
  Object.prototype.hasOwnProperty.call(interpretation?.data || {}, "tier");

const addCaseToGroup = (groups, group, caseId) => {
  if (!group) return;
  if (!groups.has(group)) groups.set(group, new Set());
  groups.get(group).add(caseId);
};

export const emptyInterpretationSummary = () => ({
  all: new Set(),
  withTierChange: new Set(),
  byAuthor: new Map(),
  byGene: new Map(),
});

export const summarizeInterpretationsForDataset = (
  interpretations = [],
  datasetId,
) => {
  const summary = emptyInterpretationSummary();

  interpretations.forEach((interpretation) => {
    if (
      !idsMatch(
        getInterpretationSourceDatasetId(interpretation),
        datasetId,
      )
    ) {
      return;
    }

    const caseId = getInterpretationSourceCaseId(interpretation);
    if (caseId == null) return;

    summary.all.add(caseId);
    if (hasTierChange(interpretation)) {
      summary.withTierChange.add(caseId);
    }
    addCaseToGroup(summary.byAuthor, interpretation.authorName, caseId);
    addCaseToGroup(summary.byGene, interpretation.gene, caseId);
  });

  return summary;
};

const mergeSets = (target, source) => {
  (source || []).forEach((value) => target.add(value));
};

const mergeGroupedSets = (target, source) => {
  (source || []).forEach((caseIds, group) => {
    if (!target.has(group)) target.set(group, new Set());
    mergeSets(target.get(group), caseIds);
  });
};

export const mergeInterpretationSummaries = (...summaries) => {
  const merged = emptyInterpretationSummary();

  summaries.forEach((summary) => {
    mergeSets(merged.all, summary?.all);
    mergeSets(merged.withTierChange, summary?.withTierChange);
    mergeGroupedSets(merged.byAuthor, summary?.byAuthor);
    mergeGroupedSets(merged.byGene, summary?.byGene);
  });

  return merged;
};

export const countInterpretationsForDataset = (
  interpretations = [],
  datasetId,
) =>
  interpretations.reduce((counts, interpretation) => {
    if (
      !idsMatch(
        getInterpretationSourceDatasetId(interpretation),
        datasetId,
      )
    ) {
      return counts;
    }

    const caseId = getInterpretationSourceCaseId(interpretation);
    if (caseId == null) return counts;
    counts.set(caseId, (counts.get(caseId) || 0) + 1);
    return counts;
  }, new Map());

export const mergeInterpretationCounts = (...countMaps) =>
  countMaps.reduce((merged, counts) => {
    (counts || []).forEach((count, caseId) => {
      merged.set(caseId, (merged.get(caseId) || 0) + Number(count || 0));
    });
    return merged;
  }, new Map());
