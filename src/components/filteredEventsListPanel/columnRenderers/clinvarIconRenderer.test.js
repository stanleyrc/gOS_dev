/** @jest-environment node */

import ClassIconRenderer from "./ClassIconRenderer";
import ClinvarIconRenderer from "./clinvarIconRenderer";

function renderClinvar(value, record) {
  return new ClinvarIconRenderer({ value, record }).render();
}

describe("ClinvarIconRenderer", () => {
  test("makes an allele annotation a new-tab ClinVar link with a click hint", () => {
    const clinvarIcon = renderClinvar({
      class: "pathogenic",
      desc: "Pathogenic",
      ALLELEID: 12345,
    });

    expect(clinvarIcon.type).toBe(ClassIconRenderer);
    expect(clinvarIcon.props.href).toBe(
      "https://www.ncbi.nlm.nih.gov/clinvar/?term=12345[alleleid]",
    );
    expect(clinvarIcon.props.linkAriaLabel).toBe(
      "Open allele 12345 in ClinVar",
    );
    expect(clinvarIcon.props.tooltipHint).toBe("Click to open ClinVar.");
  });

  test("uses a record-level allele ID when it is separate from the annotation", () => {
    const clinvarIcon = renderClinvar(
      { class: "benign", desc: "Benign" },
      { ALLELEID: 67890 },
    );

    expect(clinvarIcon.props.href).toBe(
      "https://www.ncbi.nlm.nih.gov/clinvar/?term=67890[alleleid]",
    );
  });

  test.each([
    [
      "pathogenic",
      "Pathogenic",
      "3:37053348-37053348 TA>T",
      "3:37053347:TA:T(GRCh37)",
    ],
    [
      "benign",
      "Benign",
      "17:59770785-59770785 T>A",
      "17:59770785:T:A(GRCh37)",
    ],
    [
      "na",
      "Conflicting pathogenicity",
      "5:235414-235414 A>G",
      "5:235414:A:G(GRCh37)",
    ],
  ])(
    "links a %s ClinVar badge by variant when its allele ID is unavailable",
    (classValue, desc, variantG, searchTerm) => {
      const clinvarIcon = renderClinvar(
        { class: classValue, score: -1, desc },
        { Variant_g: variantG },
      );

      expect(clinvarIcon.props.href).toBe(
        `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(
          searchTerm,
        )}`,
      );
      expect(clinvarIcon.props.linkAriaLabel).toBe(
        `Open ${variantG} in ClinVar`,
      );
      expect(clinvarIcon.props.tooltipHint).toBe("Click to open ClinVar.");
    },
  );

  test("keeps only Not in ClinVar badges non-clickable", () => {
    const clinvarIcon = renderClinvar(
      { class: "na", desc: "Not in ClinVar" },
      { Variant_g: "17:7577538-7577538 C>T" },
    );

    expect(clinvarIcon.props.href).toBeUndefined();
    expect(clinvarIcon.props.linkAriaLabel).toBeUndefined();
    expect(clinvarIcon.props.tooltipHint).toBeUndefined();
  });
});
