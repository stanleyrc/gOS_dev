/** @jest-environment node */

import { HtmlRenderer } from "./htmlRenderer";

describe("HtmlRenderer table of contents", () => {
  let warnSpy;
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("logo unavailable"));
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warnSpy.mockRestore();
  });

  it("contains fragment navigation inside the generated report document", async () => {
    const result = await new HtmlRenderer().render({
      patient: { caseId: "CASE-001" },
      alterations: [
        { gene: "TP53", variant: "p.R175H", tier: "1" },
      ],
      interpretations: [
        { caseId: "CASE-001", data: { notes: "Legacy embedded value" } },
      ],
    });

    expect(result.html).toContain("event.preventDefault()");
    expect(result.html).toContain("target.scrollIntoView");
    expect(result.html).toContain('closest(\'a[href^="#"]\')');
    expect(result.html).not.toContain("interpretations-data");
    expect(result.html).not.toContain("Legacy embedded value");
  });
});
