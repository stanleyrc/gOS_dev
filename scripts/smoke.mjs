#!/usr/bin/env node
// Smoke test of a deployed gOS: the app shell, its manifest and bundle, the
// dataset list and, for the first single-cell dataset, the patient-level files
// of every patient. Exit code 1 on any failure. Usage: node scripts/smoke.mjs [baseUrl]
const base = (process.argv[2] || "https://mskiweb.nygenome.org/sclarke/gOS_dev/").replace(/\/?$/, "/");
const failures = [];
const check = async (url, type = "text") => {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return type === "json" ? r.json() : r.text();
  } catch (e) {
    failures.push(`${url}: ${e.message}`);
    return null;
  }
};
const html = await check(`${base}index.html`);
const main = html && html.match(/static\/js\/main\.[a-z0-9]+\.js/);
if (!main) failures.push("index.html: no main bundle reference");
else await check(`${base}${main[0]}`);
const manifest = await check(`${base}asset-manifest.json`, "json");
if (manifest && main && !`${manifest.files?.["main.js"]}`.endsWith(main[0].replace(/^static/, "static"))) failures.push("asset-manifest main.js differs from index.html");
const datasets = await check(`${base}datasets.json`, "json");
const sc = (datasets || []).find((d) => d.id === "gbm-sc") || (datasets || [])[0];
if (sc) {
  const datafiles = await check(sc.datafilesPath, "json");
  const patients = (datafiles || []).filter((r) => r.entry_type === "patient");
  for (const p of patients) {
    for (const f of ["metadata.json", "tree.nwk", "snv_matrix.json", "filtered.events.json", "signatures.json", "rna/cells.json"]) {
      // eslint-disable-next-line no-await-in-loop
      await check(`${sc.dataPath}${p.pair}/${f}`);
    }
  }
  console.log(`${patients.length} patients checked in ${sc.id}`);
}
if (failures.length) {
  console.error(`SMOKE FAILED\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`SMOKE OK (${main ? main[0] : "no bundle"})`);
