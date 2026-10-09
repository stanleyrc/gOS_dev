import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import * as d3 from "d3";
import { filterWalks } from "../../../helpers/singleCell/walks";
import { INK } from "../../../helpers/singleCell/plotTheme";

// 10 + 8 + 9 distinct hues before anything repeats
const PALETTE = [...d3.schemeTableau10, ...d3.schemeDark2, ...d3.schemeSet1];

/**
 * The patient's walks (walks.json), the filter settings that hide spurious
 * walks, the walks passing them (with stats over the displayed cells) and a
 * stable colour per walk id.
 */
export default function useWalks(cellIds) {
  const walksSource = useSelector((s) => s.SingleCell.walks);
  const [filters, setFilters] = useState({ minCells: 1, minMedianCn: 4, curatedOnly: false, circularOnly: false, driverOnly: false, minCn: 1 });
  // jsonlite unboxes length-1 vectors: genes / driver_genes may arrive as strings
  const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  // walk cell ids may be spelled differently from the gOS ids (MGH302_MR2_pl3_10b vs MGH302_MR_2_pl3_10b):
  // rename them onto the patient's cells by a key without separators / case
  const idKey = (x) => `${x}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const all = useMemo(() => {
    if (walksSource.status !== "ok") return [];
    const canonical = new Map(cellIds.map((id) => [idKey(id), id]));
    const remap = (cells) => {
      const out = {};
      Object.entries(cells || {}).forEach(([id, cn]) => {
        out[canonical.get(idKey(id)) || id] = cn;
      });
      return out;
    };
    return (walksSource.data?.walks || []).map((w) => ({ ...w, id: `${w.id}`, genes: asList(w.genes), driver_genes: asList(w.driver_genes), nodes: w.nodes || [], junctions: w.junctions || [], cells: remap(w.cells) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walksSource, cellIds.join("|")]);
  // cells that have walk counts at all (walks.json "cells"); null = unknown, treat every cell as measured
  const measured = useMemo(() => {
    const listed = walksSource.status === "ok" ? walksSource.data?.cells : null;
    if (!Array.isArray(listed) || !listed.length) return null;
    const canonical = new Map(cellIds.map((id) => [idKey(id), id]));
    return new Set(listed.map((id) => canonical.get(idKey(id)) || `${id}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walksSource, cellIds.join("|")]);
  const filtered = useMemo(() => filterWalks(all, cellIds, filters), [all, cellIds, filters]);
  // how many walk cell ids name a cell of this patient: none means the export keyed cells differently
  const idMatch = useMemo(() => {
    const listed = new Set();
    all.forEach((w) => Object.keys(w.cells || {}).forEach((id) => listed.add(id)));
    const known = new Set(cellIds);
    let matched = 0;
    listed.forEach((id) => {
      if (known.has(id)) matched += 1;
    });
    return { listed: listed.size, matched, example: listed.size ? [...listed][0] : null };
  }, [all, cellIds]);
  const colorOf = useMemo(() => {
    const order = all.slice().sort((a, b) => (b.ncells || 0) - (a.ncells || 0));
    const m = new Map(order.map((w, i) => [w.id, PALETTE[i % PALETTE.length]]));
    return (id) => m.get(id) || INK.faint;
  }, [all]);
  return { status: walksSource.status, all, measured, filtered, filters, setFilters, colorOf, idMatch, byId: useMemo(() => new Map(all.map((w) => [w.id, w])), [all]) };
}
