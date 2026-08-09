/** @jest-environment node */

import {
  CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID,
  CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID,
  createExactEventKey,
  getEffectiveFrequency,
  getExactEventInterpretations,
  getTierCountsForInterpretations,
  getInterpretationSourceCaseId,
  getInterpretationSourceDatasetId,
  isCaseInterpretationImport,
} from "./interpretationHistory";
import {
  getAllInterpretationsForEvent,
  getInterpretationForAlteration,
  getTierCountsByExactEventKey,
  getTierCountsForEvent,
  hasTierHistoryForEvent,
} from "../redux/interpretations/selectors";

const event = {
  uid: "7:140453136-7:140453136",
  gene: " BRAF ",
  variant: " p.Val600Glu / c.1799T>A ",
  type: "Missense",
};

const matchingInterpretation = {
  datasetId: "dataset-a",
  caseId: "case-a",
  alterationId: "7:140453136-7:140453136",
  gene: "BRAF",
  variant: "p.Val600Glu / c.1799T>A",
  variant_type: "Missense",
  authorId: "imported-user-tier-1",
  data: { tier: "1" },
  frequency: 6,
  source: {
    kind: "case-interpretation-import",
    aggregateId: "braf-alice-tier-1",
  },
};

const ordinaryInterpretation = {
  ...matchingInterpretation,
  datasetId: "dataset-b",
  caseId: "case-b",
  authorId: "ordinary-user",
  data: { tier: "2" },
  frequency: 20,
  source: undefined,
};

const otherVariant = {
  ...matchingInterpretation,
  alterationId: "7:140453137-7:140453137",
  variant: "p.Val600Lys / c.1798_1799delinsAA",
  authorId: "other-variant",
  data: { tier: "3" },
  frequency: 20,
};

describe("interpretation history", () => {
  it("builds the same exact-event key across cases and datasets", () => {
    expect(createExactEventKey(event)).toBe(
      createExactEventKey(matchingInterpretation),
    );
  });

  it("does not create an exact identity for an incomplete event", () => {
    expect(createExactEventKey({ ...event, variant: null })).toBeNull();
  });

  it("keeps distinct variants separate", () => {
    expect(createExactEventKey(event)).not.toBe(
      createExactEventKey(otherVariant),
    );
  });

  it("selects exact-event history across cases and datasets", () => {
    expect(
      getExactEventInterpretations(
        [matchingInterpretation, ordinaryInterpretation, otherVariant],
        event,
      ),
    ).toEqual([matchingInterpretation, ordinaryInterpretation]);
  });

  it("identifies imported history independently of authenticated users", () => {
    expect(
      isCaseInterpretationImport({
        source: { kind: "case-interpretation-import" },
      }),
    ).toBe(true);
    expect(isCaseInterpretationImport(ordinaryInterpretation)).toBe(false);
  });

  it("deterministically prefers canonical storage when legacy duplicates exist", () => {
    const canonical = {
      ...matchingInterpretation,
      datasetId: CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID,
      caseId: CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID,
      frequency: 5,
    };
    const legacy = {
      ...matchingInterpretation,
      datasetId: "legacy-dataset",
      caseId: "legacy-case",
      frequency: 9,
    };

    expect(getExactEventInterpretations([canonical, legacy], event)).toEqual([
      canonical,
    ]);
    expect(getExactEventInterpretations([legacy, canonical], event)).toEqual([
      canonical,
    ]);
  });

  it("counts duplicate source snapshots as one global imported aggregate", () => {
    const laterSnapshot = {
      ...matchingInterpretation,
      datasetId: "dataset-c",
      caseId: "case-c",
      frequency: 9,
    };

    const exactHistory = getExactEventInterpretations(
      [matchingInterpretation, laterSnapshot, ordinaryInterpretation],
      event,
    );

    expect(exactHistory).toEqual([laterSnapshot, ordinaryInterpretation]);
    expect(getTierCountsForInterpretations(exactHistory)).toEqual({
      1: 9,
      2: 1,
      3: 0,
    });
  });

  it("presents imported source provenance instead of its storage address", () => {
    const imported = {
      ...matchingInterpretation,
      caseId: "storage-case",
      datasetId: "storage-dataset",
      source: {
        ...matchingInterpretation.source,
        caseId: "latest-case",
        datasetId: "latest-dataset",
      },
    };

    expect(getInterpretationSourceCaseId(imported)).toBe("latest-case");
    expect(getInterpretationSourceDatasetId(imported)).toBe("latest-dataset");
    expect(getInterpretationSourceCaseId(ordinaryInterpretation)).toBe("case-b");
    expect(getInterpretationSourceDatasetId(ordinaryInterpretation)).toBe("dataset-b");
  });

  it("uses supplied frequency and defaults ordinary history to one", () => {
    expect(getEffectiveFrequency(matchingInterpretation)).toBe(6);
    expect(getEffectiveFrequency(ordinaryInterpretation)).toBe(1);
    expect(
      getTierCountsForInterpretations([
        matchingInterpretation,
        ordinaryInterpretation,
        { ...matchingInterpretation, data: { tier: "not-a-tier" } },
      ]),
    ).toEqual({ 1: 6, 2: 1, 3: 0 });
  });

  it("does not select a current interpretation from a stale context", () => {
    const selectedKey = "event___author___case-a";
    const state = {
      CaseReport: { id: "case-b" },
      Settings: { dataset: { id: "dataset-a" } },
      Interpretations: {
        selected: { [matchingInterpretation.alterationId]: selectedKey },
        byId: { [selectedKey]: matchingInterpretation },
      },
    };

    expect(
      getInterpretationForAlteration(
        state,
        matchingInterpretation.alterationId,
      ),
    ).toBeNull();
  });

  it("projects exact history and weighted tier counts from Redux", () => {
    const state = {
      Interpretations: {
        byGene: {
          BRAF: {
            matching: matchingInterpretation,
            ordinary: ordinaryInterpretation,
            other: otherVariant,
          },
        },
      },
    };

    expect(getAllInterpretationsForEvent(state, event)).toEqual([
      matchingInterpretation,
      ordinaryInterpretation,
    ]);
    expect(getTierCountsForEvent(state, event)).toEqual({ 1: 6, 2: 1, 3: 0 });
    expect(getTierCountsByExactEventKey(state)[createExactEventKey(event)]).toEqual({
      1: 6,
      2: 1,
      3: 0,
    });
    expect(hasTierHistoryForEvent(state, event)).toBe(true);
  });
});
