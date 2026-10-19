import { useEffect, useMemo, useState } from "react";
import { modelsPath, normalizeModels, parseGeneMode, DEFAULT_GENE_MODE } from "../../helpers/genes/geneModels";

// one fetch per chromosome file for the whole app session
const cache = new Map(); // path -> Promise<json>
const loaded = new Map(); // path -> { status, json?, error? }

function fetchModels(path) {
  if (!cache.has(path)) {
    const p = fetch(path)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        loaded.set(path, { status: "ok", json });
        return json;
      })
      .catch((error) => {
        loaded.set(path, { status: "error", error: `${error?.message || error}` });
        throw error;
      });
    cache.set(path, p);
  }
  return cache.get(path);
}

/**
 * Transcript models of the given chromosomes ([{ chromosome, startPlace }]), loaded lazily and cached.
 * Returns { genes: normalized genes of all ok chromosomes, status: "idle" | "loading" | "ok" | "error", error }.
 * Only hg38 has models files; other references return status "error" with the reason.
 */
export function useGeneModels(chromosomes, reference = "hg38") {
  const key = (chromosomes || []).map((c) => c.chromosome).join(",");
  const [, setTick] = useState(0);
  useEffect(() => {
    if (reference !== "hg38") return undefined;
    let alive = true;
    (chromosomes || []).forEach((c) => {
      const path = modelsPath(c.chromosome);
      if (loaded.has(path)) return;
      fetchModels(path).finally(() => alive && setTick((t) => t + 1)).catch(() => {});
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reference]);
  const states = (chromosomes || []).map((c) => ({ c, s: loaded.get(modelsPath(c.chromosome)) }));
  const sig = states.map(({ s }) => s?.status || "loading").join(",");
  const genes = useMemo(
    () => states.filter(({ s }) => s?.status === "ok").flatMap(({ c, s }) => normalizeModels(s.json, c.startPlace)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, sig]
  );
  if (reference !== "hg38") return { genes: [], status: "error", error: `isoform models exist for hg38 only (this case is ${reference})` };
  if (!states.length) return { genes: [], status: "idle" };
  const err = states.find(({ s }) => s?.status === "error");
  if (err) return { genes, status: "error", error: `${modelsPath(err.c.chromosome)}: ${err.s.error}` };
  if (states.some(({ s }) => !s)) return { genes, status: "loading" };
  return { genes, status: "ok" };
}

const EVENT = "gos-genemode";

/** Gene track mode shared by every track on the page and kept in the URL (?genemode=collapsed|squished|expanded). */
export function useGeneMode() {
  const read = () => {
    try {
      return parseGeneMode(new URL(window.location.href).searchParams.get("genemode"));
    } catch (e) {
      return DEFAULT_GENE_MODE;
    }
  };
  const [mode, setModeState] = useState(read);
  useEffect(() => {
    const on = (e) => setModeState(parseGeneMode(e.detail));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const setMode = (m) => {
    const next = parseGeneMode(m);
    try {
      const url = new URL(window.location.href);
      if (next === DEFAULT_GENE_MODE) url.searchParams.delete("genemode");
      else url.searchParams.set("genemode", next);
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch (e) {
      // URL not writable (sandboxed preview): keep the mode in memory only
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  };
  return [mode, setMode];
}
