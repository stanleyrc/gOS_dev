import { useEffect, useRef, useState } from "react";
import { tableFromIPC } from "apache-arrow";
import { tryGet } from "../../../redux/singleCell/loaders";
import { resolveUrl } from "../../../helpers/singleCell/trackBrowser/trackSpec";
import { decodeU16, parseHeatmapIndex } from "../../../helpers/singleCell/trackBrowser/cnHeatmap";
import { parseAtacIndex } from "../../../helpers/singleCell/trackBrowser/atac";
import { openBigWig } from "../../../helpers/singleCell/trackBrowser/bigwig";
import { rangeReader } from "../../../helpers/singleCell/trackBrowser/rangeFetch";
import { gunzipAll, parsePeaks } from "../../../helpers/singleCell/trackBrowser/peaks";

const dirOf = (url) => `${url}`.replace(/[^/]*$/, "");
const CELL_ATAC_MAX = 120;
const MAT_MAX = 6; // chromosome matrices kept (each <= ~2.3 MB as uint16, x2 as float32)

/**
 * Data of the v0.4 tracks (cn_heatmap, atac), fetched lazily:
 * - heat map index; the genome-wide 5 Mb LOD matrix (when `lodWanted`); one chromosome matrix per window chromosome;
 * - atac index; per pool bigWig region reads for the windows (range requests, zoom level from the pixel size) and the
 *   pool's peaks; per-cell 500 kb atac.arrow for the cell rows in view.
 * Statuses are "loading" | "ok" | "missing" | "error" (+ reason); version bumps on arrival (redraw trigger).
 */
export default function useV04Data({ dataPath, patient, genome, specBase, heatTrack, atacTrack, slots, lodWanted, poolIds, cellAtacIds }) {
  const [version, setVersion] = useState(0);
  const st = useRef({ hm: { status: "none" }, mats: new Map(), matStatus: new Map(), lod: null, lodStatus: "none", atac: { status: "none" }, bw: new Map(), regions: new Map(), peaks: new Map(), peakStatus: new Map(), cellAtac: new Map(), cellAtacStatus: new Map(), lru: [] });
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);
  const bump = () => alive.current && setVersion((v) => v + 1);
  const s = st.current;
  const ctx = { dataPath, patient, genome, base: specBase };
  const hmUrl = heatTrack && !heatTrack.unavailable ? resolveUrl(heatTrack.url, ctx) : null;
  const atacUrl = atacTrack && !atacTrack.unavailable ? resolveUrl(atacTrack.url, ctx) : null;

  // heat-map index
  useEffect(() => {
    s.hm = { status: hmUrl ? "loading" : "none" };
    s.mats = new Map();
    s.matStatus = new Map();
    s.lod = null;
    s.lodStatus = "none";
    bump();
    if (!hmUrl) return;
    tryGet(hmUrl).then((r) => {
      if (r.status !== "ok") s.hm = { status: r.status, error: r.status === "missing" ? "no cn_heatmap/index.json" : `${r.error?.message || r.status}` };
      else {
        const p = parseHeatmapIndex(r.data);
        s.hm = p.ok ? { status: "ok", index: p.index, url: hmUrl } : { status: "error", error: p.error };
      }
      bump();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hmUrl]);

  const fetchMatrix = (file, nBins, onDone) => {
    const idx = s.hm.index;
    tryGet(`${dirOf(s.hm.url)}${file}`, { responseType: "arraybuffer" }).then((r) => {
      if (r.status !== "ok") return onDone(null, r.status === "missing" ? `no ${file}` : `${r.error?.message || r.status}`);
      try {
        return onDone(decodeU16(r.data, idx.cells.length, nBins, idx.scale, idx.na), null);
      } catch (e) {
        return onDone(null, e.message);
      }
    });
  };

  // chromosome matrices of the windows, and the LOD
  const chromKey = (slots || []).map((x) => x.window.chrom).join(",");
  useEffect(() => {
    if (s.hm.status !== "ok") return;
    const idx = s.hm.index;
    [...new Set((slots || []).map((x) => x.window.chrom))].forEach((c) => {
      const entry = idx.chroms.get(c);
      if (!entry || s.matStatus.has(c)) return;
      s.matStatus.set(c, "loading");
      fetchMatrix(entry.file, entry.starts.length, (mat, err) => {
        if (mat) {
          s.mats.set(c, mat);
          s.matStatus.set(c, "ok");
          while (s.mats.size > MAT_MAX) {
            const drop = [...s.mats.keys()].find((k) => !(slots || []).some((x) => x.window.chrom === k));
            if (!drop) break;
            s.mats.delete(drop);
            s.matStatus.delete(drop);
          }
        } else s.matStatus.set(c, `error: ${err}`);
        bump();
      });
    });
    if (lodWanted && idx.lod && s.lodStatus === "none") {
      s.lodStatus = "loading";
      fetchMatrix(idx.lod.file, idx.lod.bins.length, (mat, err) => {
        s.lod = mat;
        s.lodStatus = mat ? "ok" : `error: ${err}`;
        bump();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.hm.status, chromKey, lodWanted]);

  // atac index
  useEffect(() => {
    s.atac = { status: atacUrl ? "loading" : "none" };
    s.regions = new Map();
    bump();
    if (!atacUrl) return;
    tryGet(atacUrl).then((r) => {
      if (r.status !== "ok") s.atac = { status: r.status, error: r.status === "missing" ? "no atac/index.json" : `${r.error?.message || r.status}` };
      else {
        const p = parseAtacIndex(r.data);
        s.atac = p.ok ? { status: "ok", index: p.index, url: atacUrl } : { status: "error", error: p.error };
      }
      bump();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atacUrl]);

  const poolById = (id) => {
    const idx = s.atac.index;
    if (!idx) return null;
    return id === "all" ? idx.all : idx.pools.find((p) => p.id === id) || null;
  };
  const bwOf = (pool) => {
    const url = `${dirOf(s.atac.url)}${pool.bigwig}`;
    if (!s.bw.has(url)) s.bw.set(url, openBigWig(rangeReader(url)));
    return s.bw.get(url);
  };

  // bigWig region reads per pool and window (debounced while panning) + peaks per pool
  const regionKey = (pool, slot) => `${pool}|${slot.window.chrom}:${slot.window.start}-${slot.window.end}|${Math.round(slot.width)}`;
  const wantKey = `${(poolIds || []).join(",")}#${(slots || []).map((x) => regionKey("", x)).join(";")}`;
  useEffect(() => {
    if (s.atac.status !== "ok" || !(poolIds || []).length) return undefined;
    const t = setTimeout(() => {
      (poolIds || []).forEach((id) => {
        const pool = poolById(id);
        if (!pool) return;
        (slots || []).forEach((slot) => {
          const key = regionKey(id, slot);
          if (s.regions.has(key)) return;
          s.regions.set(key, { status: "loading" });
          const w = slot.window;
          const bpPerPixel = (w.end - w.start + 1) / Math.max(1, slot.width);
          bwOf(pool)
            .then((bw) => bw.readRegion(w.chrom, w.start - 1, w.end, { bpPerPixel }))
            .then((res) => s.regions.set(key, { status: "ok", ...res }))
            .catch((e) => s.regions.set(key, { status: "error", error: e.message }))
            .finally(() => {
              if (s.regions.size > 400) [...s.regions.keys()].slice(0, 100).forEach((k) => s.regions.delete(k));
              bump();
            });
        });
        if (pool.peaks && !s.peakStatus.has(id)) {
          s.peakStatus.set(id, "loading");
          tryGet(`${dirOf(s.atac.url)}${pool.peaks}`, { responseType: "arraybuffer" }).then((r) => {
            if (r.status === "ok") {
              try {
                s.peaks.set(id, parsePeaks(gunzipAll(r.data)));
                s.peakStatus.set(id, "ok");
              } catch (e) {
                s.peakStatus.set(id, `error: ${e.message}`);
              }
            } else s.peakStatus.set(id, r.status);
            bump();
          });
        }
      });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.atac.status, wantKey]);

  // per-cell ATAC (500 kb atac.arrow) for the cell rows in view
  const cellUrl = atacTrack && !atacTrack.unavailable ? atacTrack.cell_url || atacTrack.per_cell?.url || "{dataPath}{unit}/atac.arrow" : null;
  useEffect(() => {
    if (!cellUrl) return;
    (cellAtacIds || []).forEach((id) => {
      if (s.cellAtacStatus.has(id)) {
        s.lru = [id, ...s.lru.filter((x) => x !== id)];
        return;
      }
      s.cellAtacStatus.set(id, "loading");
      tryGet(resolveUrl(cellUrl, { ...ctx, unit: id }), { responseType: "arraybuffer" }).then((r) => {
        if (r.status !== "ok") s.cellAtacStatus.set(id, r.status);
        else {
          try {
            const table = tableFromIPC(r.data);
            const x = table.getChild("x")?.toArray();
            const y = table.getChild("y")?.toArray();
            if (!x || !y) s.cellAtacStatus.set(id, "error");
            else {
              let binWidth = Infinity;
              for (let i = 1; i < Math.min(x.length, 400); i += 1) if (x[i] - x[i - 1] > 0 && x[i] - x[i - 1] < binWidth) binWidth = x[i] - x[i - 1];
              s.cellAtac.set(id, { x, y, binWidth: Number.isFinite(binWidth) ? binWidth : 500000 });
              s.cellAtacStatus.set(id, "ok");
              s.lru = [id, ...s.lru.filter((v) => v !== id)];
              while (s.lru.length > CELL_ATAC_MAX) {
                const drop = s.lru.pop();
                s.cellAtac.delete(drop);
                s.cellAtacStatus.delete(drop);
              }
            }
          } catch (e) {
            s.cellAtacStatus.set(id, "error");
          }
        }
        bump();
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellUrl, (cellAtacIds || []).join("|")]);

  return { ...s, version, regionKey, poolById };
}
