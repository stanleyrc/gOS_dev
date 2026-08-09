/** @jest-environment node */

import fs from "fs";
import path from "path";
import { parseCaseInterpretationImport } from "./caseInterpretationImport";

const caseId = "ACTN01020002T";
const fixturePath = (...parts) =>
  path.join(process.cwd(), "public", "data", caseId, ...parts);

describe("Case Interpretation Import fixtures", () => {
  it("imports exact weighted history for multiple events in one case", () => {
    const events = JSON.parse(
      fs.readFileSync(fixturePath("filtered.events.json"), "utf8"),
    )
      .filter(({ gene }) => ["CASZ1", "CLCA3P"].includes(gene))
      .map((event) => {
        const [, chromosome, start, end] =
          /^(\w+):(\d+)-(\d+)/.exec(event.Variant_g);
        return {
          ...event,
          uid: `${chromosome}:${start}-${chromosome}:${end}`,
          variant: event.Variant,
        };
      });
    const result = parseCaseInterpretationImport({
      userTierText: fs.readFileSync(
        fixturePath(
          "retier_trace",
          "retier_agg_user_tier_ACTN01020002T.tsv",
        ),
        "utf8",
      ),
      tierText: fs.readFileSync(
        fixturePath("retier_trace", "retier_agg_tier_ACTN01020002T.tsv"),
        "utf8",
      ),
      events,
      datasetId: "hmf_demo",
      caseId,
    });

    expect(result.state).toBe("ready");
    expect(new Set(result.interpretations.map(({ gene }) => gene))).toEqual(
      new Set(["CASZ1", "CLCA3P"]),
    );
    expect(result.interpretations).toHaveLength(6);
    expect(result.distributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: expect.objectContaining({ gene: "CASZ1" }),
          counts: { 1: 3, 2: 2, 3: 4 },
        }),
        expect.objectContaining({
          event: expect.objectContaining({ gene: "CLCA3P" }),
          counts: { 1: 1, 2: 3, 3: 2 },
        }),
      ]),
    );
  });
});
