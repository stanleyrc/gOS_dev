import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useHiddenCellIds } from "../useCovQc";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { CURRENT_TREE, alignTipNames, legacyTreeName } from "../../../helpers/singleCell/treeCompare";
import { parseNewick } from "../../../helpers/singleCell/newick";
import { annotateSupport } from "../../../helpers/singleCell/treeSupport";
import { supportKeys, variantFile } from "../../../helpers/singleCell/treeVariants";

const cache = new Map();

/**
 * A phylogeny of the open patient by name: the tree drawn in the Single-Cell tab
 * (store `treeVariant`, "gos" by default) comes from the single-cell store; "gos"
 * otherwise is tree.nwk and the others are trees/<name>.nwk (tips already gOS cell ids).
 * `support` is the parsed trees/support.json; when it has an entry for the tree its internal nodes carry `support: { fbp, tbe }`.
 * @returns { status: "idle" | "loading" | "ok" | "missing" | "error", root, matched, total }
 */
export default function useAltTree(name, support = null) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const tree = useSelector((s) => s.SingleCell.tree);
  const drawn = useSelector((s) => s.SingleCell.treeVariant) || CURRENT_TREE;
  const index = useSelector((s) => s.SingleCell.altTrees?.data);
  const supportFor = (n) => {
    if (!support?.available) return null;
    const keys = supportKeys(n, index);
    for (const k of keys) {
      const hit = support.trees?.[k] || support.trees?.[legacyTreeName(k)];
      if (hit) return hit;
    }
    return null;
  };
  const cells = useSelector((s) => s.SingleCell.cells);
  const hidden = useHiddenCellIds(); // global cell filter, incl. "Hide low-QC cells"
  const ids = useMemo(() => cells.map((c) => `${c.cell_id}`).filter((id) => !hidden.has(id)), [cells, hidden]);
  const [file, setFile] = useState({ name: null, status: "idle", text: null });

  useEffect(() => {
    if (!name || name === drawn || !dataset || !patient) return undefined;
    const key = `${dataset.dataPath}${patient.caseReportId}/${name}`;
    if (!cache.has(key)) {
      const get = (n) => tryGet(casePath(dataset, patient.caseReportId, variantFile(n)), { responseType: "text" });
      const legacy = legacyTreeName(name); // data not yet renamed: fall back to the old file name
      cache.set(key, get(name).then((r) => (r?.status !== "ok" && legacy ? get(legacy) : r)).catch((error) => ({ status: "error", error })));
    }
    let cancelled = false;
    setFile({ name, status: "loading", text: null });
    cache.get(key).then((r) => {
      if (cancelled) return;
      if (r?.status !== "ok") cache.delete(key);
      setFile({ name, status: r?.status === "ok" ? "ok" : r?.status || "error", text: r?.data ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [name, dataset, patient, drawn]);

  return useMemo(() => {
    if (!name) return { status: "idle", root: null, matched: 0, total: 0 };
    if (name === drawn) {
      const source = tree?.status === "ok" ? tree.data?.source : null;
      if (!source) return { status: "missing", root: null, matched: 0, total: 0 };
      const ann = annotateSupport(source, supportFor(name));
      const { root, matched, total } = alignTipNames(ann.root, ids);
      return { status: root ? "ok" : "missing", root, matched, total, supportMapped: ann.mapped, supportInternal: ann.internal };
    }
    if (file.name !== name || file.status === "loading" || file.status === "idle") return { status: "loading", root: null, matched: 0, total: 0 };
    if (file.status !== "ok") return { status: file.status, root: null, matched: 0, total: 0 };
    try {
      const ann = annotateSupport(parseNewick(file.text), supportFor(name));
      const { root, matched, total } = alignTipNames(ann.root, ids);
      return { status: root ? "ok" : "missing", root, matched, total, supportMapped: ann.mapped, supportInternal: ann.internal };
    } catch (error) {
      return { status: "error", root: null, matched: 0, total: 0 };
    }
  }, [name, file, tree, ids, support, drawn, index]); // eslint-disable-line react-hooks/exhaustive-deps
}
