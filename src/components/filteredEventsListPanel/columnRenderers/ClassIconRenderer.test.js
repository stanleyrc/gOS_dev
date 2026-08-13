/** @jest-environment node */

import { BsDashLg, BsQuestionCircle } from "react-icons/bs";
import { MdHealthAndSafety } from "react-icons/md";
import { PiWarningOctagonFill } from "react-icons/pi";
import ClassIconRenderer from "./ClassIconRenderer";

function renderClassIcon(props) {
  return new ClassIconRenderer(props).render();
}

function renderedIcon(classValue) {
  const renderer = renderClassIcon({ value: { class: classValue } });
  return renderer.props.children.props.children;
}

describe("ClassIconRenderer", () => {
  test.each(["na", "ambiguous"])(
    "renders the %s class as an Ant warning-yellow question mark",
    (classValue) => {
      const icon = renderedIcon(classValue);

      expect(icon.type).toBe(BsQuestionCircle);
      expect(icon.props.style.color).toBe("#faad14");
    },
  );

  test("keeps the benign and pathogenic icon colors", () => {
    const benignIcon = renderedIcon("benign");
    const pathogenicIcon = renderedIcon("pathogenic");

    expect(benignIcon.type).toBe(MdHealthAndSafety);
    expect(benignIcon.props.style.color).toBe("#52c41a");
    expect(pathogenicIcon.type).toBe(PiWarningOctagonFill);
    expect(pathogenicIcon.props.style.color).toBe("#f5222d");
  });

  test("renders an optional external link and click hint", () => {
    const renderer = renderClassIcon({
      value: { class: "pathogenic", desc: "Pathogenic" },
      href: "https://example.org/annotation",
      linkAriaLabel: "Open annotation",
      tooltipHint: "Click to open the annotation.",
    });
    const link = renderer.props.children;
    const tooltipChildren = renderer.props.title.props.children;
    const event = { stopPropagation: jest.fn() };

    link.props.onClick(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(link.type).toBe("a");
    expect(link.props.href).toBe("https://example.org/annotation");
    expect(link.props.target).toBe("_blank");
    expect(link.props.rel).toBe("noopener noreferrer");
    expect(link.props["aria-label"]).toBe("Open annotation");
    expect(tooltipChildren[2].props.children).toBe(
      "Click to open the annotation.",
    );
  });

  test("keeps an unlinked icon noninteractive and omits the click hint", () => {
    const renderer = renderClassIcon({
      value: { class: "benign", desc: "Benign" },
    });

    expect(renderer.props.children.type).toBe("span");
    expect(renderer.props.title.props.children[2]).toBeFalsy();
  });

  test("keeps the dash for a missing value", () => {
    const renderer = renderClassIcon({ value: null });

    expect(renderer.props.children.type).toBe(BsDashLg);
  });
});
