import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useHiddenCellIds } from "../useCovQc";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { CURRENT_TREE, treeFromNewick, alignTipNames } from "../../../helpers/singleCell/treeCompare";

const cache = new Map();

/**
 * A phylogeny of the open patient by name: "gos" is the current tree of the
 * single-cell store, the others are trees/<name>.nwk (tips already gOS cell ids).
 * @returns { status: "idle" | "loading" | "ok" | "missing" | "error", root, matched, total }
 */
export default function useAltTree(name) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const tree = useSelector((s) => s.SingleCell.tree);
  const cells = useSelector((s) => s.SingleCell.cells);
  const hidden = useHiddenCellIds(); // global cell filter, incl. "Hide low-QC cells"
  const ids = useMemo(() => cells.map((c) => `${c.cell_id}`).filter((id) => !hidden.has(id)), [cells, hidden]);
  const [file, setFile] = useState({ name: null, status: "idle", text: null });

  useEffect(() => {
    if (!name || name === CURRENT_TREE || !dataset || !patient) return undefined;
    const key = `${dataset.dataPath}${patient.caseReportId}/${name}`;
    if (!cache.has(key)) {
      cache.set(key, tryGet(casePath(dataset, patient.caseReportId, `trees/${name}.nwk`), { responseType: "text" }).catch((error) => ({ status: "error", error })));
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
  }, [name, dataset, patient]);

  return useMemo(() => {
    if (!name) return { status: "idle", root: null, matched: 0, total: 0 };
    if (name === CURRENT_TREE) {
      const source = tree?.status === "ok" ? tree.data?.source : null;
      if (!source) return { status: "missing", root: null, matched: 0, total: 0 };
      const { root, matched, total } = alignTipNames(source, ids);
      return { status: root ? "ok" : "missing", root, matched, total };
    }
    if (file.name !== name || file.status === "loading" || file.status === "idle") return { status: "loading", root: null, matched: 0, total: 0 };
    if (file.status !== "ok") return { status: file.status, root: null, matched: 0, total: 0 };
    try {
      const { root, matched, total } = treeFromNewick(file.text, ids);
      return { status: root ? "ok" : "missing", root, matched, total };
    } catch (error) {
      return { status: "error", root: null, matched: 0, total: 0 };
    }
  }, [name, file, tree, ids]);
}
