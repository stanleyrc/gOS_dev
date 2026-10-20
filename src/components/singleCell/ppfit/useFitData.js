import { useEffect, useState } from "react";
import { casePath, loadCellTrack, tryGet } from "../../../redux/singleCell/loaders";
import { blockMedian, evenSample, normalise, normaliseAligned, poolByPosition } from "../../../helpers/singleCell/cnFit";

export const BIN_BLOCK = 10; // 10 kb bins -> 100 kb medians
export const MAX_POOLED = 40;

/** Loads what the fit view needs: one cell (coverage, hetblocks, JaBbA segments, metadata) or a pooled group. */
export function useFitData(dataset, cellIds) {
  const [state, setState] = useState({ status: "idle" });
  const key = cellIds.join("|");
  useEffect(() => {
    if (!dataset || !cellIds.length) {
      setState({ status: "idle" });
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      const single = cellIds.length === 1;
      const ids = single ? cellIds : evenSample(cellIds, MAX_POOLED);
      const loaded = [];
      for (let i = 0; i < ids.length; i += 6) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await Promise.all(ids.slice(i, i + 6).map((id) => loadCellTrack(dataset, id, "coverage")));
        loaded.push(...batch);
        if (cancelled) return;
      }
      const ok = loaded.map((r, i) => (r.status === "ok" ? { id: ids[i], x: r.data.dataPointsX, y: r.data.dataPointsY2 } : null)).filter(Boolean);
      if (!ok.length) {
        setState({ status: "missing", reason: `coverage.arrow not available for ${single ? cellIds[0] : "any selected cell"}` });
        return;
      }
      const pooled = single ? null : poolByPosition(ok);
      const one = single ? normalise(ok[0].y) : null;
      const aligned = single ? normaliseAligned(ok[0].x, ok[0].y) : null;
      const out = {
        status: "ok", single, ids, used: single ? 1 : pooled.used, requested: cellIds.length,
        m: blockMedian(single ? one.m : pooled.m, BIN_BLOCK),
        binX: single ? aligned.x : pooled.x, // bin positions and means kept aligned for the bin plot
        binM: single ? aligned.m : pooled.m,
      };
      if (single) {
        const c = { ...ok[0], ...one };
        const [meta, het, total] = await Promise.all([
          tryGet(casePath(dataset, c.id, "metadata.json")),
          tryGet(casePath(dataset, c.id, "hetblocks.json")),
          loadCellTrack(dataset, c.id, "total"),
        ]);
        const rec = meta.status === "ok" ? (Array.isArray(meta.data) ? meta.data[0] : meta.data) || {} : {};
        Object.assign(out, {
          meanY: c.mean,
          ploidy: Number(rec.ploidy) || c.mean,
          purity: Number(rec.qc_purity) > 0 && Number(rec.qc_purity) <= 1 ? Number(rec.qc_purity) : 1,
          xs: c.x,
          ys: c.y,
          segments: total.status === "ok" ? total.data.intervals || [] : null,
          blocks: het.status === "ok" ? (het.data.blocks || []).filter((b) => b.maf != null) : null,
        });
      }
      if (!cancelled) setState(out);
    })().catch((error) => !cancelled && setState({ status: "error", error }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, key]);
  return state;
}

