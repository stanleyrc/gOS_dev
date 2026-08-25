/** @jest-environment node */

import ClassIconRenderer from "./ClassIconRenderer";
import ClinvarIconRenderer from "./clinvarIconRenderer";

function renderClinvar(value, record) {
  return new ClinvarIconRenderer({ value, record }).render();
}

describe("ClinvarIconRenderer", () => {
  test("translates the ClinVar link model into annotation badge props", () => {
    const clinvarIcon = renderClinvar(
      { class: "pathogenic", desc: "Pathogenic" },
      { Variant_g: "3:37053348-37053348 TA>T" },
    );

    expect(clinvarIcon.type).toBe(ClassIconRenderer);
    expect(clinvarIcon.props.href).toBe(
      "https://www.ncbi.nlm.nih.gov/clinvar/?term=3%3A37053347%3ATA%3AT(GRCh37)",
    );
    expect(clinvarIcon.props.linkAriaLabel).toBe(
      "Open 3:37053348-37053348 TA>T in ClinVar",
    );
    expect(clinvarIcon.props.tooltipHint).toBe("Click to open ClinVar.");
  });

  test("keeps Not in ClinVar badges non-clickable", () => {
    const clinvarIcon = renderClinvar(
      { class: "na", desc: "Not in ClinVar" },
      { Variant_g: "17:7577538-7577538 C>T" },
    );

    expect(clinvarIcon.props.href).toBeUndefined();
    expect(clinvarIcon.props.linkAriaLabel).toBeUndefined();
    expect(clinvarIcon.props.tooltipHint).toBeUndefined();
  });
});
