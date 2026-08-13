/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({
  format: (format) => (value) => {
    if (format === ".3g") return Number(value).toPrecision(3);
    return String(value);
  },
}));

import GnomadAfRenderer from "./gnomadAfRenderer";

function renderGnomadAf(props) {
  return new GnomadAfRenderer(props).render();
}

describe("GnomadAfRenderer", () => {
  test("links a formatted allele frequency to gnomAD in a new tab", () => {
    const renderer = renderGnomadAf({
      value: 0.00123,
      record: { Variant_g: "1:3329058-3329058 G>T" },
      format: ".3g",
    });
    const link = renderer.props.children;
    const event = { stopPropagation: jest.fn() };

    link.props.onClick(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(link.type).toBe("a");
    expect(link.props.children).toBe("0.00123");
    expect(link.props.href).toBe(
      "https://gnomad.broadinstitute.org/variant/1-3329058-G-T?dataset=gnomad_r2_1",
    );
    expect(link.props.target).toBe("_blank");
    expect(link.props.rel).toBe("noopener noreferrer");
    expect(link.props["aria-label"]).toBe(
      "Open variant 1-3329058-G-T in gnomAD",
    );
    expect(renderer.props.title).toBe("Click to open gnomAD.");
  });

  test("keeps a frequency non-clickable when genomic alleles are unavailable", () => {
    const renderer = renderGnomadAf({
      value: 0.25,
      record: { Variant_g: "unavailable" },
      format: ".3g",
    });

    expect(renderer.type).toBe("span");
    expect(renderer.props.children).toBe("0.250");
  });

  test("keeps the missing-value placeholder", () => {
    const renderer = renderGnomadAf({
      value: null,
      record: { Variant_g: "1:3329058-3329058 G>T" },
    });

    expect(renderer.props.italic).toBe(true);
    expect(renderer.props.disabled).toBe(true);
  });

});
