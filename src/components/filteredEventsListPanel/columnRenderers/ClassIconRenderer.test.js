/** @jest-environment node */

import { BsDashLg, BsQuestionCircle } from "react-icons/bs";
import { MdHealthAndSafety } from "react-icons/md";
import { PiWarningOctagonFill } from "react-icons/pi";
import ClassIconRenderer from "./ClassIconRenderer";

function renderedIcon(classValue) {
  const renderer = ClassIconRenderer({ value: { class: classValue } });
  return renderer.props.children.props.children;
}

describe("ClassIconRenderer", () => {
  test.each(["na", "ambiguous"])(
    "renders the %s class as an Ant warning-yellow question mark",
    (classValue) => {
      const icon = renderedIcon(classValue);

      expect(icon.type).toBe(BsQuestionCircle);
      expect(icon.props.style.color).toBe("#faad14");
    }
  );

  test("keeps the benign and pathogenic icon colors", () => {
    const benignIcon = renderedIcon("benign");
    const pathogenicIcon = renderedIcon("pathogenic");

    expect(benignIcon.type).toBe(MdHealthAndSafety);
    expect(benignIcon.props.style.color).toBe("#52c41a");
    expect(pathogenicIcon.type).toBe(PiWarningOctagonFill);
    expect(pathogenicIcon.props.style.color).toBe("#f5222d");
  });

  test("keeps the dash for a missing value", () => {
    const renderer = ClassIconRenderer({ value: null });

    expect(renderer.props.children.type).toBe(BsDashLg);
  });
});
