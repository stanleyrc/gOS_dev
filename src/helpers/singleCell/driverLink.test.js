import { driverHref } from "./driverLink";
import { driverKey } from "./driverContrast";
import { parseSelection } from "./driverLayer";
import { readDeepLink } from "./deepLink";

const fusion = { gene: "GENEA::TERT", fusion_genes: "GENEA::TERT", vartype: "fusion", Genome_Location: "5:100-200" };

test("driverHref opens the patient's Drivers layer with the driver added and its drawer open", () => {
  const href = driverHref("P1", fusion, "https://host/app/?dataset=gbm-sc&report=_cohort&scview=portrait&tab=12");
  const url = new URL(href);
  expect(url.pathname).toBe("/app/");
  expect(url.searchParams.get("dataset")).toBe("gbm-sc");
  expect(url.searchParams.get("report")).toBe("P1");
  expect(url.searchParams.get("tab")).toBe("7");
  expect(url.searchParams.has("scview")).toBe(false);
  const link = readDeepLink(url.search);
  expect(link.heatmap).toBe("drivers");
  expect(link.driverOpen).toBe(driverKey(fusion));
  expect(parseSelection(url.search).add).toEqual([driverKey(fusion)]);
});

test("driverHref without an event opens the Drivers layer only", () => {
  const url = new URL(driverHref("P2", null, "https://host/?dataset=x&drvopen=old"));
  expect(url.searchParams.get("report")).toBe("P2");
  expect(url.searchParams.has("drvopen")).toBe(false);
});
