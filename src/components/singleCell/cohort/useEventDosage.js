import { useEffect, useMemo, useRef, useState } from "react";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { geneLocus } from "../../../helpers/singleCell/dosage";
import { isNormalClone } from "../../../helpers/singleCell/figures";
import { eventClass, eventLabel } from "../../../helpers/singleCell/cohortStats";
import { addDosageQ, carrierSet, cnEvents, combineDosage, patientDosage } from "../../../helpers/singleCell/eventDosage";
import { loadRna } from "./cohortRnaPanel";

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Cis dosage of every copy-number event of event_associations.json: carriers vs non-carriers of the event on the
 * expression of the event's own gene, and per-cell gene-locus CN vs that expression, per patient and combined.
 * Runs in the browser from rna/cells.json + the RNA matrix + the per-cell genome graphs (the CN vs expression view's
 * inputs); a patient without RNA is reported as "not available (no RNA)".
 * @returns { results: Map(eventKey -> { event, perPatient, combined, q }), progress, loading }
 */
export default function useEventDosage({ summaries, datasets, rawFiles, cnRows, genesState, events, enabled }) {
  const [rna, setRna] = useState({});
  const [results, setResults] = useState(new Map());
  const [progress, setProgress] = useState(null);
  const cnList = useMemo(() => cnEvents(events), [events]);
  const patients = useMemo(() => [...new Set(cnList.flatMap((e) => e.patients))], [cnList]);
  const ready = patients.filter((p) => cnRows?.[p]?.cellRows?.length && rawFiles?.[p]?.events);
  const readyKey = ready.join(",");

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const todo = ready.filter((p) => !rna[p]);
    if (!todo.length) return undefined;
    (async () => {
      const out = {};
      for (const p of todo) {
        const s = summaries.find((x) => `${x.caseReportId}` === p);
        const ds = datasets.find((d) => `${d.id}` === `${s?.record.datasetId}`);
        if (!ds) {
          out[p] = { missing: "patient dataset not loaded" };
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const [r, matrix] = await Promise.all([loadRna(ds, p), loadRnaMatrix(ds, p)]);
          out[p] = r?.summary ? { summary: r.summary, matrix } : { missing: "no RNA" };
        } catch (error) {
          out[p] = { missing: "no RNA" };
        }
        if (!active) return;
      }
      if (active) setRna((prev) => ({ ...prev, ...out }));
    })();
    return () => {
      active = false;
    };
  }, [enabled, readyKey, datasets]); // eslint-disable-line react-hooks/exhaustive-deps

  // tumour cells with RNA and a genome-graph row, per patient
  const cellsOf = useMemo(() => {
    const out = {};
    Object.entries(rna).forEach(([p, d]) => {
      if (!d?.summary || !cnRows?.[p]?.cellRows) return;
      const rowOf = new Map(cnRows[p].cellRows.map((c) => [c.cellId, c]));
      const cells = [];
      const index = [];
      d.summary.cells.forEach((c, k) => {
        const row = c.cell_id && rowOf.get(c.cell_id);
        if (!row) return;
        if (isNormalClone(row.clone) || (c.Cell_Type && !/malig/i.test(c.Cell_Type))) return;
        cells.push({ id: c.cell_id, row: row.row });
        index.push(k);
      });
      out[p] = { cells, index };
    });
    return out;
  }, [rna, cnRows]);

  const runId = useRef(0);
  useEffect(() => {
    if (!enabled || !cnList.length || !Object.keys(rna).length) return undefined;
    const my = (runId.current += 1);
    (async () => {
      const exprCache = new Map();
      const exprOf = (p, gene) => {
        const key = `${p}|${gene}`;
        if (exprCache.has(key)) return exprCache.get(key);
        const d = rna[p];
        const gi = d?.summary ? d.summary.geneIndex.get(gene) ?? d.summary.geneIndex.get(gene.toUpperCase()) : null;
        let v = null;
        if (gi != null && cellsOf[p]) {
          const all = geneValues(d.matrix, d.summary.cells.length, gi);
          v = cellsOf[p].index.map((k) => all[k]);
        }
        exprCache.set(key, v);
        return v;
      };
      const rows = [];
      for (let i = 0; i < cnList.length; i += 1) {
        const ev = cnList[i];
        const locus = geneLocus(genesState, ev.gene);
        const perPatient = ev.patients.map((p) => {
          if (!locus) return { patient: p, status: "unavailable", reason: "gene not in the gene list" };
          if (!rna[p]) return { patient: p, status: "unavailable", reason: "RNA still loading" };
          if (rna[p].missing) return { patient: p, status: "unavailable", reason: rna[p].missing };
          if (!cellsOf[p]) return { patient: p, status: "unavailable", reason: "no copy-number rows" };
          const carriers = carrierSet(rawFiles[p]?.events, ev.gene, ev.cls, eventClass, eventLabel);
          return { patient: p, ...patientDosage({ cells: cellsOf[p].cells, expr: exprOf(p, ev.gene), carriers, locus, cls: ev.cls }) };
        });
        rows.push({ key: ev.event, event: ev, perPatient, combined: combineDosage(perPatient, ev.cls) });
        if (i % 6 === 5) {
          // eslint-disable-next-line no-await-in-loop
          await tick();
          if (runId.current !== my) return;
          setProgress(Math.round((100 * (i + 1)) / cnList.length));
        }
      }
      if (runId.current !== my) return;
      setResults(new Map(addDosageQ(rows).map((r) => [r.key, r])));
      setProgress(null);
    })();
    return () => {
      runId.current += 1;
    };
  }, [enabled, cnList, rna, cellsOf, genesState, rawFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = patients.length - ready.length;
  return { results, progress, waiting, loading: enabled && (progress != null || Object.keys(rna).length < ready.length) };
}
