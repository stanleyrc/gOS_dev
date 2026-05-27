import {
  applyPreviewCopyStateFit,
  createCopyStateFitUiState,
  derivePloidyFromFit,
  derivePurityFromIntercept,
  generateCopyStateSeparators,
  metadataToCopyStateFit,
  previewCopyStateFitDrag,
  resetCopyStateFitUiState,
  resizeCopyStateFitFromAnchoredSeparator,
  selectActiveCopyStateFit,
  shiftCopyStateFit,
} from "./copyStateFit";

void metadataToCopyStateFit;
void generateCopyStateSeparators;
void shiftCopyStateFit;
void resizeCopyStateFitFromAnchoredSeparator;
void createCopyStateFitUiState;
void derivePurityFromIntercept;
void derivePloidyFromFit;
void previewCopyStateFitDrag;
void applyPreviewCopyStateFit;
void resetCopyStateFitUiState;
void selectActiveCopyStateFit;

describe("copy-state fit math", () => {
  describe("derivePurityFromIntercept", () => {
    test("computes fit-derived purity from a typical negative intercept", () => {
      expect(derivePurityFromIntercept(-2)).toBeCloseTo(0.5);
    });

    test("returns unit purity for a zero intercept", () => {
      expect(derivePurityFromIntercept(0)).toBeCloseTo(1);
    });

    test("supports positive intercepts when the derived purity is finite", () => {
      expect(derivePurityFromIntercept(1)).toBeCloseTo(2);
    });

    test("allows finite negative purity above the intercept singularity", () => {
      expect(derivePurityFromIntercept(3)).toBeCloseTo(-2);
    });

    test("throws when intercept 2 would produce an infinite purity", () => {
      expect(() => derivePurityFromIntercept(2)).toThrow(
        "derivePurityFromIntercept produced a non-finite purity"
      );
    });

    test("throws when the derived purity is NaN", () => {
      expect(() => derivePurityFromIntercept(Number.NaN)).toThrow(
        "derivePurityFromIntercept produced a non-finite purity"
      );
    });

    test("throws when the input intercept is non-finite", () => {
      expect(() => derivePurityFromIntercept(Number.POSITIVE_INFINITY)).toThrow(
        "derivePurityFromIntercept produced a non-finite purity"
      );
    });
  });

  describe("derivePloidyFromFit", () => {
    const baseFit = {
      slope: 4,
      intercept: -2,
      spacing: 0.25,
      zeroCopyOffset: 0.5,
      purity: 0.5,
      ploidy: 2,
      source: "metadata",
    };

    test("defaults to the normalized segment mean ploidy assumption", () => {
      expect(derivePloidyFromFit(baseFit)).toBeCloseTo(2);
    });

    test("uses a caller-supplied mean segment value when available", () => {
      expect(
        derivePloidyFromFit(
          {
            ...baseFit,
            slope: 2.5,
            intercept: -1,
          },
          3
        )
      ).toBeCloseTo(6.5);
    });

    test("supports negative mean segment values by applying the direct fit formula", () => {
      expect(
        derivePloidyFromFit(
          {
            ...baseFit,
            slope: 1.5,
            intercept: -0.5,
          },
          -2
        )
      ).toBeCloseTo(-3.5);
    });

    test("returns the intercept when mean segment value is zero", () => {
      expect(
        derivePloidyFromFit(
          {
            ...baseFit,
            slope: 2.5,
            intercept: -1.25,
          },
          0
        )
      ).toBeCloseTo(-1.25);
    });

    test("supports a zero intercept", () => {
      expect(
        derivePloidyFromFit({
          ...baseFit,
          slope: 0.75,
          intercept: 0,
        })
      ).toBeCloseTo(0.75);
    });
  });

  describe("metadataToCopyStateFit", () => {
    test("converts beta and purity to explicit metadata-derived fit values", () => {
      expect(metadataToCopyStateFit({ beta: 0.25, purity: 0.5 })).toEqual({
        slope: 4,
        intercept: -2,
        spacing: 0.25,
        zeroCopyOffset: 0.5,
        purity: 0.5,
        ploidy: 2,
        source: "metadata",
      });
    });

    test("uses meanSegmentValue when deriving displayed ploidy", () => {
      expect(
        metadataToCopyStateFit({
          beta: 0.5,
          purity: 0.8,
          meanSegmentValue: 3,
        })
      ).toEqual({
        slope: 2,
        intercept: -0.5,
        spacing: 0.5,
        zeroCopyOffset: 0.25,
        purity: 0.8,
        ploidy: 5.5,
        source: "metadata",
      });
    });

    test("supports purity one with a zero-copy separator at segment mean zero", () => {
      expect(metadataToCopyStateFit({ beta: 2, purity: 1 })).toEqual({
        slope: 0.5,
        intercept: -0,
        spacing: 2,
        zeroCopyOffset: 0,
        purity: 1,
        ploidy: 0.5,
        source: "metadata",
      });
    });

    test("keeps gamma unused when present on metadata", () => {
      const fit = metadataToCopyStateFit({ beta: 1, purity: 0.5, gamma: 42 });

      expect(fit).not.toHaveProperty("gamma");
      expect(fit).toMatchObject({
        slope: 1,
        intercept: -2,
        spacing: 1,
        zeroCopyOffset: 2,
        purity: 0.5,
        ploidy: -1,
        source: "metadata",
      });
    });

    test("throws when beta cannot produce a finite positive slope", () => {
      expect(() => metadataToCopyStateFit({ beta: 0, purity: 0.5 })).toThrow(
        "metadataToCopyStateFit produced an invalid fit"
      );
    });
  });

  describe("createCopyStateFitUiState", () => {
    test("initializes UI state with the metadata base fit and no frontend edits", () => {
      const metadataFit = {
        slope: 4,
        intercept: -2,
        spacing: 0.25,
        zeroCopyOffset: 0.5,
        purity: 0.5,
        ploidy: 2,
        source: "metadata",
      };

      expect(createCopyStateFitUiState(metadataFit)).toEqual({
        metadataFit,
        previewFit: null,
        appliedOverrideFit: null,
      });
    });

    test("preserves the metadata fit object reference", () => {
      const metadataFit = {
        slope: 2,
        intercept: 0,
        spacing: 0.5,
        zeroCopyOffset: 0,
        purity: 1,
        ploidy: 2,
        source: "metadata",
      };

      const uiState = createCopyStateFitUiState(metadataFit);

      expect(uiState.metadataFit).toBe(metadataFit);
    });

    test("supports zero-valued coordinates in the metadata-derived fit", () => {
      const metadataFit = {
        slope: 1,
        intercept: 0,
        spacing: 1,
        zeroCopyOffset: 0,
        purity: 1,
        ploidy: 1,
        source: "metadata",
      };

      expect(createCopyStateFitUiState(metadataFit)).toEqual({
        metadataFit,
        previewFit: null,
        appliedOverrideFit: null,
      });
    });
  });

  describe("selectActiveCopyStateFit", () => {
    const metadataFit = {
      slope: 4,
      intercept: -2,
      spacing: 0.25,
      zeroCopyOffset: 0.5,
      purity: 0.5,
      ploidy: 2,
      source: "metadata",
    };

    const appliedOverrideFit = {
      slope: 5,
      intercept: -3,
      spacing: 0.2,
      zeroCopyOffset: 0.6,
      purity: 0.4,
      ploidy: 2,
      source: "appliedOverride",
    };

    const previewFit = {
      slope: 2,
      intercept: 0,
      spacing: 0.5,
      zeroCopyOffset: 0,
      purity: 1,
      ploidy: 2,
      source: "preview",
    };

    test("returns the metadata-derived fit when there are no frontend edits", () => {
      expect(
        selectActiveCopyStateFit({
          metadataFit,
          previewFit: null,
          appliedOverrideFit: null,
        })
      ).toBe(metadataFit);
    });

    test("returns the applied frontend override when there is no preview fit", () => {
      expect(
        selectActiveCopyStateFit({
          metadataFit,
          previewFit: null,
          appliedOverrideFit,
        })
      ).toBe(appliedOverrideFit);
    });

    test("prefers the preview fit over an applied frontend override", () => {
      expect(
        selectActiveCopyStateFit({
          metadataFit,
          previewFit,
          appliedOverrideFit,
        })
      ).toBe(previewFit);
    });

    test("supports zero-valued coordinates in the active preview fit", () => {
      expect(
        selectActiveCopyStateFit({
          metadataFit,
          previewFit,
          appliedOverrideFit: null,
        })
      ).toEqual({
        slope: 2,
        intercept: 0,
        spacing: 0.5,
        zeroCopyOffset: 0,
        purity: 1,
        ploidy: 2,
        source: "preview",
      });
    });
  });

  describe("generateCopyStateSeparators", () => {
    const baseFit = {
      slope: 4,
      intercept: -2,
      spacing: 0.25,
      zeroCopyOffset: 0.5,
      purity: 0.5,
      ploidy: 2,
      source: "metadata",
    };

    test("generates the default copy states 0..10 with fit-derived positions", () => {
      expect(generateCopyStateSeparators(baseFit)).toEqual([
        { copyState: 0, segmentMean: 0.5 },
        { copyState: 1, segmentMean: 0.75 },
        { copyState: 2, segmentMean: 1 },
        { copyState: 3, segmentMean: 1.25 },
        { copyState: 4, segmentMean: 1.5 },
        { copyState: 5, segmentMean: 1.75 },
        { copyState: 6, segmentMean: 2 },
        { copyState: 7, segmentMean: 2.25 },
        { copyState: 8, segmentMean: 2.5 },
        { copyState: 9, segmentMean: 2.75 },
        { copyState: 10, segmentMean: 3 },
      ]);
    });

    test("uses a custom max copy state inclusively", () => {
      expect(generateCopyStateSeparators(baseFit, 3)).toEqual([
        { copyState: 0, segmentMean: 0.5 },
        { copyState: 1, segmentMean: 0.75 },
        { copyState: 2, segmentMean: 1 },
        { copyState: 3, segmentMean: 1.25 },
      ]);
    });

    test("returns only the zero-copy separator when max copy state is zero", () => {
      expect(generateCopyStateSeparators(baseFit, 0)).toEqual([
        { copyState: 0, segmentMean: 0.5 },
      ]);
    });

    test("returns no separators when max copy state is negative", () => {
      expect(generateCopyStateSeparators(baseFit, -1)).toEqual([]);
    });

    test("generates only integer copy states up to a fractional max copy state", () => {
      expect(generateCopyStateSeparators(baseFit, 2.5)).toEqual([
        { copyState: 0, segmentMean: 0.5 },
        { copyState: 1, segmentMean: 0.75 },
        { copyState: 2, segmentMean: 1 },
      ]);
    });

    test("supports negative zero-copy offsets", () => {
      expect(
        generateCopyStateSeparators(
          {
            ...baseFit,
            spacing: 1.5,
            zeroCopyOffset: -0.5,
          },
          2
        )
      ).toEqual([
        { copyState: 0, segmentMean: -0.5 },
        { copyState: 1, segmentMean: 1 },
        { copyState: 2, segmentMean: 2.5 },
      ]);
    });
  });
  describe("shiftCopyStateFit", () => {
    const baseFit = {
      slope: 4,
      intercept: -2,
      spacing: 0.25,
      zeroCopyOffset: 0.5,
      purity: 0.5,
      ploidy: 2,
      source: "metadata",
    };

    test("shifts all separator positions by a positive delta while preserving spacing", () => {
      const shiftedFit = shiftCopyStateFit(baseFit, 0.125);

      expect(shiftedFit).toMatchObject({
        slope: 4,
        intercept: -2.5,
        spacing: 0.25,
        zeroCopyOffset: 0.625,
        ploidy: 1.5,
        source: "preview",
      });
      expect(shiftedFit.purity).toBeCloseTo(2 / 4.5);
      expect(generateCopyStateSeparators(shiftedFit, 2)).toEqual([
        { copyState: 0, segmentMean: 0.625 },
        { copyState: 1, segmentMean: 0.875 },
        { copyState: 2, segmentMean: 1.125 },
      ]);
    });

    test("shifts all separator positions by a negative delta", () => {
      const shiftedFit = shiftCopyStateFit(baseFit, -0.25);

      expect(shiftedFit).toMatchObject({
        slope: 4,
        intercept: -1,
        spacing: 0.25,
        zeroCopyOffset: 0.25,
        ploidy: 3,
        source: "preview",
      });
      expect(shiftedFit.purity).toBeCloseTo(2 / 3);
      expect(generateCopyStateSeparators(shiftedFit, 2)).toEqual([
        { copyState: 0, segmentMean: 0.25 },
        { copyState: 1, segmentMean: 0.5 },
        { copyState: 2, segmentMean: 0.75 },
      ]);
    });

    test("returns a preview copy without mutating the input fit when delta is zero", () => {
      const originalFit = { ...baseFit };
      const shiftedFit = shiftCopyStateFit(originalFit, 0);

      expect(shiftedFit).not.toBe(originalFit);
      expect(shiftedFit).toEqual({
        ...baseFit,
        source: "preview",
      });
      expect(originalFit).toEqual(baseFit);
    });

    test("throws when a shift would make derived purity non-finite", () => {
      expect(() => shiftCopyStateFit(baseFit, -1)).toThrow(
        "derivePurityFromIntercept produced a non-finite purity"
      );
    });
  });
  describe("resizeCopyStateFitFromAnchoredSeparator", () => {
    const baseFit = {
      slope: 4,
      intercept: -2,
      spacing: 0.25,
      zeroCopyOffset: 0.5,
      purity: 0.5,
      ploidy: 2,
      source: "metadata",
    };

    test("changes spacing from a modifier-drag while anchoring copy state 0", () => {
      const resizedFit = resizeCopyStateFitFromAnchoredSeparator(baseFit, 2, 1.5);

      expect(resizedFit).toMatchObject({
        slope: 2,
        intercept: -1,
        spacing: 0.5,
        zeroCopyOffset: 0.5,
        ploidy: 1,
        source: "preview",
      });
      expect(resizedFit.purity).toBeCloseTo(2 / 3);
      expect(generateCopyStateSeparators(resizedFit, 2)).toEqual([
        { copyState: 0, segmentMean: 0.5 },
        { copyState: 1, segmentMean: 1 },
        { copyState: 2, segmentMean: 1.5 },
      ]);
    });

    test("returns a preview copy without mutating the input fit when spacing is unchanged", () => {
      const originalFit = { ...baseFit };
      const resizedFit = resizeCopyStateFitFromAnchoredSeparator(
        originalFit,
        1,
        0.75
      );

      expect(resizedFit).not.toBe(originalFit);
      expect(resizedFit).toEqual({
        ...baseFit,
        source: "preview",
      });
      expect(originalFit).toEqual(baseFit);
    });

    test("throws when the dragged separator is copy state 0", () => {
      expect(() =>
        resizeCopyStateFitFromAnchoredSeparator(baseFit, 0, 0.75)
      ).toThrow("resizeCopyStateFitFromAnchoredSeparator produced an invalid fit");
    });

    test("throws when the dragged position would make spacing zero", () => {
      expect(() =>
        resizeCopyStateFitFromAnchoredSeparator(baseFit, 2, 0.5)
      ).toThrow("resizeCopyStateFitFromAnchoredSeparator produced an invalid fit");
    });

    test("throws when the dragged position would make spacing negative", () => {
      expect(() =>
        resizeCopyStateFitFromAnchoredSeparator(baseFit, 2, 0)
      ).toThrow("resizeCopyStateFitFromAnchoredSeparator produced an invalid fit");
    });
  });

  describe("previewCopyStateFitDrag", () => {
    const metadataFit = {
      slope: 4,
      intercept: -2,
      spacing: 0.25,
      zeroCopyOffset: 0.5,
      purity: 0.5,
      ploidy: 2,
      source: "metadata",
    };

    const appliedOverrideFit = {
      slope: 5,
      intercept: -3,
      spacing: 0.2,
      zeroCopyOffset: 0.6,
      purity: 0.4,
      ploidy: 2,
      source: "appliedOverride",
    };

    const previewFit = {
      slope: 2,
      intercept: -1,
      spacing: 0.5,
      zeroCopyOffset: 0.5,
      purity: 2 / 3,
      ploidy: 1,
      source: "preview",
    };

    test("routes a normal drag with explicit delta to a transient shift preview", () => {
      const uiState = {
        metadataFit,
        previewFit: null,
        appliedOverrideFit: null,
      };

      const nextState = previewCopyStateFitDrag(uiState, {
        mode: "shift",
        copyState: 2,
        segmentMean: 1.125,
        deltaSegmentMean: 0.125,
      });

      expect(nextState).toEqual({
        metadataFit,
        previewFit: {
          slope: 4,
          intercept: -2.5,
          spacing: 0.25,
          zeroCopyOffset: 0.625,
          purity: 2 / 4.5,
          ploidy: 1.5,
          source: "preview",
        },
        appliedOverrideFit: null,
      });
      expect(nextState).not.toBe(uiState);
      expect(nextState.metadataFit).toBe(metadataFit);
      expect(uiState).toEqual({
        metadataFit,
        previewFit: null,
        appliedOverrideFit: null,
      });
    });

    test("uses the drag-start fit for bidirectional normal-drag previews instead of compounding on the current preview", () => {
      const uiState = {
        metadataFit,
        previewFit,
        appliedOverrideFit: null,
      };

      const nextState = previewCopyStateFitDrag(uiState, {
        mode: "shift",
        copyState: 2,
        segmentMean: 0.875,
        deltaSegmentMean: -0.125,
        startFit: metadataFit,
      });

      expect(nextState.previewFit).toMatchObject({
        slope: 4,
        intercept: -1.5,
        spacing: 0.25,
        zeroCopyOffset: 0.375,
        ploidy: 2.5,
        source: "preview",
      });
      expect(nextState.previewFit.purity).toBeCloseTo(2 / 3.5);
      expect(nextState.metadataFit).toBe(metadataFit);
      expect(nextState.appliedOverrideFit).toBeNull();
    });

    test("derives a normal-drag delta from the dragged separator position when no delta is supplied", () => {
      const nextState = previewCopyStateFitDrag(
        {
          metadataFit,
          previewFit: null,
          appliedOverrideFit: null,
        },
        {
          mode: "shift",
          copyState: 2,
          segmentMean: 1.125,
        }
      );

      expect(nextState.previewFit).toMatchObject({
        slope: 4,
        intercept: -2.5,
        spacing: 0.25,
        zeroCopyOffset: 0.625,
        ploidy: 1.5,
        source: "preview",
      });
      expect(nextState.previewFit.purity).toBeCloseTo(2 / 4.5);
    });

    test("routes a spacing-edit drag to an anchored spacing preview", () => {
      const nextState = previewCopyStateFitDrag(
        {
          metadataFit,
          previewFit: null,
          appliedOverrideFit: null,
        },
        {
          mode: "spacing",
          copyState: 2,
          segmentMean: 1.5,
        }
      );

      expect(nextState.previewFit).toMatchObject({
        slope: 2,
        intercept: -1,
        spacing: 0.5,
        zeroCopyOffset: 0.5,
        ploidy: 1,
        source: "preview",
      });
      expect(nextState.previewFit.purity).toBeCloseTo(2 / 3);
      expect(nextState.metadataFit).toBe(metadataFit);
      expect(nextState.appliedOverrideFit).toBeNull();
    });

    test("uses an applied frontend override as the drag base when no preview exists", () => {
      const nextState = previewCopyStateFitDrag(
        {
          metadataFit,
          previewFit: null,
          appliedOverrideFit,
        },
        {
          mode: "shift",
          copyState: 1,
          segmentMean: 0.85,
          deltaSegmentMean: 0.05,
        }
      );

      expect(nextState).toEqual({
        metadataFit,
        previewFit: {
          slope: 5,
          intercept: -3.25,
          spacing: 0.2,
          zeroCopyOffset: 0.65,
          purity: 2 / 5.25,
          ploidy: 1.75,
          source: "preview",
        },
        appliedOverrideFit,
      });
      expect(nextState.appliedOverrideFit).toBe(appliedOverrideFit);
    });

    test("uses an existing preview fit as the drag base for continued preview updates", () => {
      const nextState = previewCopyStateFitDrag(
        {
          metadataFit,
          previewFit,
          appliedOverrideFit,
        },
        {
          mode: "spacing",
          copyState: 2,
          segmentMean: 2,
        }
      );

      expect(nextState.previewFit).toMatchObject({
        slope: 4 / 3,
        intercept: -2 / 3,
        spacing: 0.75,
        zeroCopyOffset: 0.5,
        ploidy: 2 / 3,
        source: "preview",
      });
      expect(nextState.previewFit.purity).toBeCloseTo(0.75);
      expect(nextState.metadataFit).toBe(metadataFit);
      expect(nextState.appliedOverrideFit).toBe(appliedOverrideFit);
    });
  });

  describe("applyPreviewCopyStateFit", () => {
    const metadataFit = {
      slope: 4,
      intercept: -2,
      spacing: 0.25,
      zeroCopyOffset: 0.5,
      purity: 0.5,
      ploidy: 2,
      source: "metadata",
    };

    const previewFit = {
      slope: 2,
      intercept: -1,
      spacing: 0.5,
      zeroCopyOffset: 0.5,
      purity: 2 / 3,
      ploidy: 1,
      source: "preview",
    };

    const appliedOverrideFit = {
      slope: 5,
      intercept: -3,
      spacing: 0.2,
      zeroCopyOffset: 0.6,
      purity: 0.4,
      ploidy: 2,
      source: "appliedOverride",
    };

    test("promotes an existing preview fit to a session-only applied override", () => {
      const uiState = {
        metadataFit,
        previewFit,
        appliedOverrideFit: null,
      };

      const appliedState = applyPreviewCopyStateFit(uiState);

      expect(appliedState).toEqual({
        metadataFit,
        previewFit: null,
        appliedOverrideFit: {
          ...previewFit,
          source: "appliedOverride",
        },
      });
      expect(appliedState.appliedOverrideFit).not.toBe(previewFit);
      expect(selectActiveCopyStateFit(appliedState)).toBe(
        appliedState.appliedOverrideFit
      );
      expect(uiState).toEqual({
        metadataFit,
        previewFit,
        appliedOverrideFit: null,
      });
      expect(previewFit.source).toBe("preview");
    });

    test("replaces an older applied override when a newer preview is applied", () => {
      const appliedState = applyPreviewCopyStateFit({
        metadataFit,
        previewFit,
        appliedOverrideFit,
      });

      expect(appliedState).toEqual({
        metadataFit,
        previewFit: null,
        appliedOverrideFit: {
          ...previewFit,
          source: "appliedOverride",
        },
      });
      expect(appliedState.appliedOverrideFit).not.toBe(appliedOverrideFit);
    });

    test("leaves state unchanged when there is no preview fit to apply", () => {
      const uiState = {
        metadataFit,
        previewFit: null,
        appliedOverrideFit,
      };

      expect(applyPreviewCopyStateFit(uiState)).toEqual(uiState);
    });
  });

  describe("resetCopyStateFitUiState", () => {
    const metadataFit = {
      slope: 4,
      intercept: -2,
      spacing: 0.25,
      zeroCopyOffset: 0.5,
      purity: 0.5,
      ploidy: 2,
      source: "metadata",
    };

    const previewFit = {
      slope: 2,
      intercept: -1,
      spacing: 0.5,
      zeroCopyOffset: 0.5,
      purity: 2 / 3,
      ploidy: 1,
      source: "preview",
    };

    const appliedOverrideFit = {
      slope: 5,
      intercept: -3,
      spacing: 0.2,
      zeroCopyOffset: 0.6,
      purity: 0.4,
      ploidy: 2,
      source: "appliedOverride",
    };

    test("clears preview and applied override so active rendering returns to metadata", () => {
      const uiState = {
        metadataFit,
        previewFit,
        appliedOverrideFit,
      };

      const resetState = resetCopyStateFitUiState(uiState);

      expect(resetState).toEqual({
        metadataFit,
        previewFit: null,
        appliedOverrideFit: null,
      });
      expect(resetState.metadataFit).toBe(metadataFit);
      expect(selectActiveCopyStateFit(resetState)).toBe(metadataFit);
      expect(uiState).toEqual({
        metadataFit,
        previewFit,
        appliedOverrideFit,
      });
    });

    test("clears an applied override even when there is no preview", () => {
      const resetState = resetCopyStateFitUiState({
        metadataFit,
        previewFit: null,
        appliedOverrideFit,
      });

      expect(resetState).toEqual({
        metadataFit,
        previewFit: null,
        appliedOverrideFit: null,
      });
      expect(selectActiveCopyStateFit(resetState)).toBe(metadataFit);
    });

    test("returns initialized reset state when there are no frontend edits", () => {
      const uiState = {
        metadataFit,
        previewFit: null,
        appliedOverrideFit: null,
      };

      expect(resetCopyStateFitUiState(uiState)).toEqual(uiState);
    });
  });
});
