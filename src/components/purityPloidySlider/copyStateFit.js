import { maxSeparatorsCount } from "../../helpers/segmentWidth";

export const copyStateFitSources = Object.freeze({
  metadata: "metadata",
  preview: "preview",
  appliedOverride: "appliedOverride",
});

function createValidatedCopyStateFit({
  slope,
  intercept,
  spacing,
  zeroCopyOffset,
  source,
  meanSegmentValue = 1,
  isValid = true,
  errorMessage,
}) {
  if (
    !isValid ||
    !Number.isFinite(spacing) ||
    spacing <= 0 ||
    !Number.isFinite(slope) ||
    slope <= 0 ||
    !Number.isFinite(zeroCopyOffset) ||
    !Number.isFinite(intercept)
  ) {
    throw new Error(errorMessage);
  }

  const copyStateFit = {
    slope,
    intercept,
    spacing,
    zeroCopyOffset,
    purity: derivePurityFromIntercept(intercept),
    ploidy: 0,
    source,
  };

  copyStateFit.ploidy = derivePloidyFromFit(copyStateFit, meanSegmentValue);

  if (!Number.isFinite(copyStateFit.ploidy)) {
    throw new Error(errorMessage);
  }

  return copyStateFit;
}

/**
 * @typedef {"metadata" | "preview" | "appliedOverride"} CopyStateFitSource
 *
 * @typedef {Object} CopyStateFit
 * @property {number} slope - Copy-number slope where copy_number = slope * segment_mean + intercept; invariant: slope > 0.
 * @property {number} intercept - Copy-number intercept where copy_number = slope * segment_mean + intercept.
 * @property {number} spacing - Plot-native distance between adjacent copy-state separators; invariant: spacing > 0 and slope = 1 / spacing.
 * @property {number} zeroCopyOffset - Segment-mean position for copy state 0; invariant: intercept = -zeroCopyOffset / spacing.
 * @property {number} purity - Derived purity, normally 2 / (2 - intercept).
 * @property {number} ploidy - Derived displayed ploidy. This frontend fit assumes normalized mean_segment_value = 1 unless a caller supplies another value.
 * @property {CopyStateFitSource} source - Origin of this fit in the frontend session.
 *
 * @typedef {Object} CopyStateSeparator
 * @property {number} copyState - Integer copy-state label represented by this separator.
 * @property {number} segmentMean - Segment-mean x-position for this separator.
 *
 * @typedef {Object} CopyStateFitUiState
 * @property {CopyStateFit} metadataFit - Metadata-derived base fit; Reset always restores this fit.
 * @property {?CopyStateFit} previewFit - Transient frontend fit produced by drag preview before Apply.
 * @property {?CopyStateFit} appliedOverrideFit - Session-only applied frontend override; never persisted to backend metadata.
 *
 * @typedef {Object} CopyStateFitDrag
 * @property {"shift" | "spacing"} mode - Normal drag shifts the family; modifier-drag edits spacing.
 * @property {number} copyState - Dragged separator copy state. Spacing mode must use a nonzero copy state.
 * @property {number} segmentMean - Dragged separator x-position in segment-mean units.
 * @property {number} [deltaSegmentMean] - Normal-drag horizontal delta in segment-mean units.
 * @property {CopyStateFit} [startFit] - Stable active fit captured at drag start; used so repeated preview updates do not compound.
 */

/**
 * Convert metadata beta/purity into the explicit CopyStateFit representation.
 * Gamma remains unused for copy-state separator math in issue-0001.
 *
 * @param {{ beta: number, purity: number, meanSegmentValue?: number }} metadata
 * @returns {CopyStateFit}
 */
export function metadataToCopyStateFit(metadata) {
  const spacing = metadata.beta;
  const slope = 1 / spacing;
  const intercept = -(2 / metadata.purity - 2);
  const zeroCopyOffset = -intercept * spacing;

  return createValidatedCopyStateFit({
    slope,
    intercept,
    spacing,
    zeroCopyOffset,
    source: copyStateFitSources.metadata,
    meanSegmentValue: metadata.meanSegmentValue,
    errorMessage: "metadataToCopyStateFit produced an invalid fit",
  });
}

/**
 * Generate copy-state separators 0..maxCopyState from the active CopyStateFit.
 *
 * @param {CopyStateFit} copyStateFit
 * @param {number} [maxCopyState]
 * @returns {CopyStateSeparator[]}
 */
export function generateCopyStateSeparators(
  copyStateFit,
  maxCopyState = maxSeparatorsCount
) {
  const separators = [];
  const lastCopyState = Math.floor(maxCopyState);

  for (let copyState = 0; copyState <= lastCopyState; copyState += 1) {
    separators.push({
      copyState,
      segmentMean:
        copyStateFit.zeroCopyOffset + copyStateFit.spacing * copyState,
    });
  }

  return separators;
}

/**
 * Produce a preview fit by shifting the whole separator family while preserving spacing.
 *
 * @param {CopyStateFit} copyStateFit
 * @param {number} deltaSegmentMean
 * @returns {CopyStateFit}
 */
export function shiftCopyStateFit(copyStateFit, deltaSegmentMean) {
  const spacing = copyStateFit.spacing;
  const slope = 1 / spacing;
  const zeroCopyOffset = copyStateFit.zeroCopyOffset + deltaSegmentMean;
  const intercept = -zeroCopyOffset / spacing;

  return createValidatedCopyStateFit({
    slope,
    intercept,
    spacing,
    zeroCopyOffset,
    source: copyStateFitSources.preview,
    errorMessage: "shiftCopyStateFit produced an invalid fit",
  });
}

/**
 * Produce a preview fit from a modifier-drag of a nonzero separator, anchored at copy state 0.
 *
 * @param {CopyStateFit} copyStateFit
 * @param {number} copyState
 * @param {number} draggedSegmentMean
 * @returns {CopyStateFit}
 */
export function resizeCopyStateFitFromAnchoredSeparator(
  copyStateFit,
  copyState,
  draggedSegmentMean
) {
  const zeroCopyOffset = copyStateFit.zeroCopyOffset;
  const spacing = (draggedSegmentMean - zeroCopyOffset) / copyState;
  const slope = 1 / spacing;
  const intercept = -zeroCopyOffset / spacing;

  return createValidatedCopyStateFit({
    slope,
    intercept,
    spacing,
    zeroCopyOffset,
    source: copyStateFitSources.preview,
    isValid:
      Number.isFinite(copyState) &&
      copyState !== 0 &&
      Number.isFinite(draggedSegmentMean),
    errorMessage: "resizeCopyStateFitFromAnchoredSeparator produced an invalid fit",
  });
}

/**
 * Derive purity from copy-number intercept.
 *
 * @param {number} intercept
 * @returns {number}
 */
export function derivePurityFromIntercept(intercept) {
  if (!Number.isFinite(intercept)) {
    throw new Error(
      "derivePurityFromIntercept produced a non-finite purity"
    );
  }

  const purity = 2 / (2 - intercept);

  if (!Number.isFinite(purity)) {
    throw new Error(
      "derivePurityFromIntercept produced a non-finite purity"
    );
  }

  return purity;
}

/**
 * Derive displayed ploidy from a fit. Uses normalized mean_segment_value = 1 by default.
 *
 * @param {CopyStateFit} copyStateFit
 * @param {number} [meanSegmentValue]
 * @returns {number}
 */
export function derivePloidyFromFit(copyStateFit, meanSegmentValue = 1) {
  const ploidy = copyStateFit.slope * meanSegmentValue + copyStateFit.intercept;

  return ploidy;
}

/**
 * Create UI fit state from the metadata-derived base fit.
 *
 * @param {CopyStateFit} metadataFit
 * @returns {CopyStateFitUiState}
 */
export function createCopyStateFitUiState(metadataFit) {
  return {
    metadataFit,
    previewFit: null,
    appliedOverrideFit: null,
  };
}

/**
 * Select the currently active fit, preferring preview over applied override over metadata.
 *
 * @param {CopyStateFitUiState} uiState
 * @returns {CopyStateFit}
 */
export function selectActiveCopyStateFit(uiState) {
  if (uiState.previewFit != null) {
    return uiState.previewFit;
  }

  if (uiState.appliedOverrideFit != null) {
    return uiState.appliedOverrideFit;
  }

  return uiState.metadataFit;
}

/**
 * Convert a separator drag event into preview UI state without mutating backend metadata.
 *
 * @param {CopyStateFitUiState} uiState
 * @param {CopyStateFitDrag} drag
 * @returns {CopyStateFitUiState}
 */
export function previewCopyStateFitDrag(uiState, drag) {
  const activeFit = selectActiveCopyStateFit(uiState);
  const dragBaseFit = drag.startFit || activeFit;
  let previewFit;

  if (drag.mode === "shift") {
    const currentDraggedSegmentMean =
      dragBaseFit.zeroCopyOffset + dragBaseFit.spacing * drag.copyState;
    const deltaSegmentMean =
      drag.deltaSegmentMean === undefined
        ? drag.segmentMean - currentDraggedSegmentMean
        : drag.deltaSegmentMean;

    previewFit = shiftCopyStateFit(dragBaseFit, deltaSegmentMean);
  } else if (drag.mode === "spacing") {
    previewFit = resizeCopyStateFitFromAnchoredSeparator(
      dragBaseFit,
      drag.copyState,
      drag.segmentMean
    );
  } else {
    throw new Error("previewCopyStateFitDrag received an unsupported drag mode");
  }

  return {
    metadataFit: uiState.metadataFit,
    previewFit,
    appliedOverrideFit: uiState.appliedOverrideFit,
  };
}

/**
 * Promote preview fit to a session-only applied frontend override and clear preview.
 *
 * @param {CopyStateFitUiState} uiState
 * @returns {CopyStateFitUiState}
 */
export function applyPreviewCopyStateFit(uiState) {
  if (uiState.previewFit == null) {
    return {
      ...uiState,
      previewFit: null,
    };
  }

  const activeFit = selectActiveCopyStateFit(uiState);

  return {
    metadataFit: uiState.metadataFit,
    previewFit: null,
    appliedOverrideFit: {
      ...activeFit,
      source: copyStateFitSources.appliedOverride,
    },
  };
}

/**
 * Clear preview/applied frontend edits and restore the metadata-derived fit.
 *
 * @param {CopyStateFitUiState} uiState
 * @returns {CopyStateFitUiState}
 */
export function resetCopyStateFitUiState(uiState) {
  return {
    metadataFit: uiState.metadataFit,
    previewFit: null,
    appliedOverrideFit: null,
  };
}
