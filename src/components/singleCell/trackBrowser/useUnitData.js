import { useEffect, useRef, useState } from "react";
import { tableFromIPC } from "apache-arrow";
import { tryGet } from "../../../redux/singleCell/loaders";
import { resolveUrl } from "../../../helpers/singleCell/trackBrowser/trackSpec";

const COVERAGE_CACHE_MAX = 80; // units whose coverage stays in memory (~2 MB each as typed arrays)
const CONCURRENCY = 4;

/**
 * Per-unit data of the track browser, fetched lazily from the spec's track URLs:
 * graphs for every unit (small; reused from the heatmap's cellFiles when already loaded) and coverage only for
 * the rows in view (plus a margin), kept in a small LRU cache. Returns { graphs, coverage, status, version }:
 * graphs/coverage are Maps unitId -> data, status Map `${track}:${unit}` -> "loading" | "ok" | "missing" | "error";
 * version bumps whenever something arrives (redraw trigger).
 */
export default function useUnitData({ dataPath, patient, genome, unitIds, coverageIds, graphTrack, coverageTrack, cellFiles }) {
  const store = useRef({ graphs: new Map(), coverage: new Map(), status: new Map(), lru: [] });
  const [version, setVersion] = useState(0);
  const queue = useRef([]);
  const active = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const bump = () => alive.current && setVersion((v) => v + 1);

  const pump = () => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const job = queue.current.shift();
      active.current += 1;
      job()
        .catch(() => null)
        .finally(() => {
          active.current -= 1;
          bump();
          pump();
        });
    }
  };

  const enqueue = (key, job, front = false) => {
    const s = store.current;
    if (s.status.has(key)) return;
    s.status.set(key, "loading");
    if (front) queue.current.unshift(job);
    else queue.current.push(job);
  };

  // graphs: all units (complex.json is ~60 kB per cell)
  useEffect(() => {
    if (!graphTrack) return;
    const s = store.current;
    let fromCache = false;
    unitIds.forEach((id) => {
      const key = `graph:${id}`;
      const cached = cellFiles?.[id]?.genome;
      if (cached && !s.graphs.has(id)) {
        s.graphs.set(id, cached);
        s.status.set(key, "ok");
        fromCache = true;
        return;
      }
      enqueue(key, async () => {
        const url = resolveUrl(graphTrack.url, { dataPath, patient, unit: id, genome });
        const r = await tryGet(url);
        s.status.set(key, r.status);
        if (r.status === "ok") s.graphs.set(id, r.data);
      });
    });
    if (fromCache) bump();
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIds.join("|"), graphTrack?.url, dataPath]);

  // coverage: rows in view first
  useEffect(() => {
    if (!coverageTrack) return;
    const s = store.current;
    coverageIds.forEach((id) => {
      const key = `cov:${id}`;
      if (s.coverage.has(id)) {
        s.lru = [id, ...s.lru.filter((x) => x !== id)];
        return;
      }
      enqueue(
        key,
        async () => {
          const url = resolveUrl(coverageTrack.url, { dataPath, patient, unit: id, genome });
          const r = await tryGet(url, { responseType: "arraybuffer" });
          s.status.set(key, r.status);
          if (r.status !== "ok") return;
          const table = tableFromIPC(r.data);
          const x = table.getChild("x")?.toArray();
          const y = table.getChild("y")?.toArray();
          if (!x || !y) {
            s.status.set(key, "error");
            return;
          }
          let binWidth = Infinity;
          for (let i = 1; i < Math.min(x.length, 400); i += 1) if (x[i] - x[i - 1] > 0 && x[i] - x[i - 1] < binWidth) binWidth = x[i] - x[i - 1];
          s.coverage.set(id, { x, y, binWidth: Number.isFinite(binWidth) ? binWidth : 10000 });
          s.lru = [id, ...s.lru.filter((v) => v !== id)];
          while (s.lru.length > COVERAGE_CACHE_MAX) {
            const drop = s.lru.pop();
            s.coverage.delete(drop);
            s.status.delete(`cov:${drop}`);
          }
        },
        true
      );
    });
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverageIds.join("|"), coverageTrack?.url, dataPath]);

  return { ...store.current, version };
}
