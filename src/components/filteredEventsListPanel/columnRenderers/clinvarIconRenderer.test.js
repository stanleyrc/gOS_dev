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

  test("keeps annotations without an allele ID non-clickable", () => {
    const clinvarIcon = renderClinvar({
      class: "na",
      desc: "Not in ClinVar",
    });

    expect(clinvarIcon.props.href).toBeUndefined();
    expect(clinvarIcon.props.linkAriaLabel).toBeUndefined();
    expect(clinvarIcon.props.tooltipHint).toBeUndefined();
  });

});
