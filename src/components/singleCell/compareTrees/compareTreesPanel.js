import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Checkbox, Radio, Select, Space, Spin, Statistic, Switch, Tag, Tooltip, Typography } from "antd";
import { clipLongBranches, layoutTree, longBranchCap, pruneTree } from "../../../helpers/singleCell/newick";
import { isNormalClone } from "../../../helpers/singleCell/figures";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import {
  CURRENT_TREE,
  MAX_PAINTED,
  branchPaths,
  cladeAt,
  cladeCells,
  defaultPair,
  eventChoices,
  eventLeafStates,
  fmtF1,
  nodeCloneKeys,
  optimizeRotation,
  paintColors,
  rowRuns,
  rowsOf,
  searchSnvs,
  snvCellIndex,
  snvConcordance,
  snvLabel,
  snvLeafStates,
  sharedCells,
  stripLengths,
  tanglegramLinks,
  treeConcordance,
  usableTrees,
} from "../../../helpers/singleCell/treeCompare";
import { rowMap, snvColumnOrder, snvMetricMax, treeColumnOrder } from "../../../helpers/singleCell/matrix";
import { filterSnvColumns, hasCladeScores } from "../../../helpers/singleCell/snvSites";
import singleCellActions from "../../../redux/singleCell/actions";
import MutationSidePanel, { SNV_CATEGORIES } from "../mutationSidePanel";
import usePixelRatio from "../usePixelRatio";
import usePlotTheme from "../usePlotTheme";
import useContainerWidth from "../useContainerWidth";
import useAltTree from "./useAltTree";

const { Text } = Typography;
const DOT = 9; // width of a painted mutation column
const TREE_MIN = 140;
const UNKNOWN = "#999999";

/** Concordance of the SNVs with one tree, computed in the background. */
function useConcordance(snvData, layout) {
  const [res, setRes] = useState(null);
  useEffect(() => {
    setRes(null);
    if (!snvData || !layout) return undefined;
    let stop = false;
    treeConcordance(snvData, layout, { cancelled: () => stop }).then((r) => {
      if (!stop && r) setRes(r);
    });
    return () => {
      stop = true;
    };
  }, [snvData, layout]);
  return res;
}

export default function CompareTreesPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const pixelRatio = usePixelRatio();
  const theme = usePlotTheme();
  const index = useSelector((s) => s.SingleCell.altTrees?.data);
  const cells = useSelector((s) => s.SingleCell.cells);
  const cloneColors = useSelector((s) => s.SingleCell.cloneColors) || {};
  const snv = useSelector((s) => s.SingleCell.snv);
  const snvOrder = useSelector((s) => s.SingleCell.snvOrder);
  const siteFilter = useSelector((s) => s.SingleCell.layout) || {};
  const events = useSelector((s) => s.FilteredEvents?.filteredEvents);
  const trees = useMemo(() => usableTrees(index), [index]);
  const [defA, defB] = useMemo(() => defaultPair(trees), [trees]);
  const [nameA, setNameA] = useState(null);
  const [nameB, setNameB] = useState(null);
  const a = nameA || defA;
  const b = nameB || defB;
  const treeA = useAltTree(a);
  const treeB = useAltTree(b);
  const [showLinks, setShowLinks] = useState(true);
  const [hideNormal, setHideNormal] = useState(true);
  const [clip, setClip] = useState(true);
  const [cladogram, setCladogram] = useState(false);
  const [showMatrix, setShowMatrix] = useState(true);
  const [matrixMode, setMatrixMode] = useState("both"); // "both" | "A" | "B": one matrix per tree, or one shared matrix in that tree's order
  const [metric, setMetric] = useState(null); // null: genotype calls when the matrix has them
  const [hdrA, setHdrA] = useState(null);
  const [hdrB, setHdrB] = useState(null);
  const [painted, setPainted] = useState([]); // keys "s:<variant index>" / "e:<event key>"
  const [search, setSearch] = useState("");
  const [hover, setHover] = useState(null); // cell id
  const [pick, setPick] = useState(null); // { side, cells: Set }
  const [wrapRef, width] = useContainerWidth(1000);

  const cellById = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c])), [cells]);
  const cloneOf = (id) => cellById.get(id)?.clone_id ?? null;
  const colorOfClone = (k) => (k == null ? UNKNOWN : cloneColors[k] || UNKNOWN);

  const snvData = snv?.status === "ok" ? snv.data : null;
  const variants = useMemo(() => (snvData ? snvData.variants.map((v, i) => ({ ...v, index: i })) : []), [snvData]);
  const cellIndex = useMemo(() => snvCellIndex(snvData), [snvData]);
  const eventList = useMemo(() => eventChoices(events), [events]);
  // the matrix scored and drawn on genotype calls (as the concordance), not read-based status
  const snvCalls = useMemo(() => (snvData ? { ...snvData, status: snvData.gt || snvData.status } : null), [snvData]);
  const matrixMetric = metric || (snvData?.gt ? "gt" : "vaf");
  const matrixMax = useMemo(() => (snvCalls ? snvMetricMax(snvCalls, matrixMetric) : 1), [snvCalls, matrixMetric]);
  const nDrivers = useMemo(() => (snvData ? snvData.variants.filter((v) => v.driver).length : 0), [snvData]);
  const categoryCounts = useMemo(() => {
    const counts = {};
    if (snvData) snvData.variants.forEach((v) => v.category && (counts[v.category] = (counts[v.category] || 0) + 1));
    return counts;
  }, [snvData]);

  // Full layouts (all cells, branch lengths): concordance is scored on these, as in analysis/qc_bwh69/consistency_tree.py.
  const fullA = useMemo(() => (treeA.root ? layoutTree(treeA.root) : null), [treeA.root]);
  const fullB = useMemo(() => (treeB.root ? layoutTree(treeB.root) : null), [treeB.root]);
  const concA = useConcordance(snvData, fullA);
  const concB = useConcordance(snvData, fullB);

  // Drawn trees: optionally without normal cells / branch lengths, rotated to minimise crossings
  const prepared = useMemo(() => {
    if (!treeA.root || !treeB.root) return null;
    const keep = hideNormal ? new Set(cells.filter((c) => !isNormalClone(c.clone_id)).map((c) => `${c.cell_id}`)) : null;
    const prep = (r) => {
      const pr = keep ? pruneTree(r, keep) : r;
      return pr && cladogram ? stripLengths(pr) : pr;
    };
    const ra = prep(treeA.root);
    const rb = prep(treeB.root);
    if (!ra || !rb) return null;
    return optimizeRotation(ra, rb);
  }, [treeA.root, treeB.root, hideNormal, cladogram, cells]);
  const finish = (root) => {
    if (!root) return null;
    const l = layoutTree(root);
    return clip && !cladogram ? clipLongBranches(l, longBranchCap(l, 1.5)) : l;
  };
  const layoutA = useMemo(() => finish(prepared?.rootA), [prepared, clip, cladogram]); // eslint-disable-line react-hooks/exhaustive-deps
  const layoutB = useMemo(() => finish(prepared?.rootB), [prepared, clip, cladogram]); // eslint-disable-line react-hooks/exhaustive-deps
  const links = useMemo(() => tanglegramLinks(layoutA, layoutB), [layoutA, layoutB]);
  const crossings = prepared ? prepared.after : 0;
  const nShared = useMemo(() => sharedCells(layoutA, layoutB).size, [layoutA, layoutB]);

  const paints = useMemo(
    () =>
      painted
        .map((key) => {
          if (key.startsWith("s:")) {
            const vi = Number(key.slice(2));
            const v = variants[vi];
            return v ? { key, label: snvLabel(v), kind: "snv", vi } : null;
          }
          const ev = eventList.find((e) => `e:${e.key}` === key);
          return ev ? { key, label: ev.label, kind: "event", event: ev.event } : null;
        })
        .filter(Boolean),
    [painted, variants, eventList]
  );

  const colors = paintColors(theme.mode);
  const nP = paints.length;
  const sides = showMatrix && snvCalls ? (matrixMode === "both" ? ["A", "B"] : [matrixMode]) : [];
  const mw = Math.max(120, Math.min(360, Math.round(width * (sides.length > 1 ? 0.17 : 0.27))));
  const mwA = sides.includes("A") ? mw : 0;
  const mwB = sides.includes("B") ? mw : 0;
  const midW = showLinks ? 100 : 14;
  const treeW = Math.max(TREE_MIN, Math.floor((width - 2 * (nP * DOT + 8) - mwA - mwB - midW) / 2));
  const nRows = Math.max(layoutA?.leaves.length || 0, layoutB?.leaves.length || 0, 1);
  const H = Math.min(900, Math.max(320, nRows * 4));
  const pad = sides.length ? 0 : 6; // rows must line up with the matrices
  const xA0 = 0;
  const xA1 = treeW; // tips of A
  const pA0 = xA1 + 4; // painted columns of A
  const mA0 = pA0 + nP * DOT + 4; // matrix of A
  const mid0 = mA0 + mwA;
  const mid1 = mid0 + midW;
  const mB0 = mid1; // matrix of B
  const pB0 = mB0 + mwB; // painted columns of B
  const xB1 = pB0 + nP * DOT + 4; // tips of B (mirrored: root at the far right)
  const totalW = xB1 + treeW;
  const rowY = (n) => (r) => pad + (r / n) * (H - 2 * pad);

  // A: root at the left (x=0 -> 0), tips at the right. B mirrored: root at the right.
  const gA = useMemo(() => {
    if (!layoutA) return null;
    const n = layoutA.leaves.length;
    const maxX = layoutA.maxX || 1;
    return { n, px: (x) => xA0 + (x / maxX) * (treeW - 2), py: rowY(n), maxX };
  }, [layoutA, treeW, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const gB = useMemo(() => {
    if (!layoutB) return null;
    const n = layoutB.leaves.length;
    const maxX = layoutB.maxX || 1;
    return { n, px: (x) => totalW - (x / maxX) * (treeW - 2), py: rowY(n), maxX };
  }, [layoutB, treeW, H, totalW]); // eslint-disable-line react-hooks/exhaustive-deps

  const highlight = pick ? pick.cells : null;
  const active = (id) => (highlight ? highlight.has(id) : true);

  const drawTree = (layout, g, side) => {
    if (!layout || !g) return null;
    const ck = nodeCloneKeys(layout, cloneOf);
    const paths = branchPaths(layout, g.px, g.py, (id) => colorOfClone(ck[id]) || theme.branch);
    const edge = side === "A" ? xA1 - 2 : xB1 + 2;
    const guide = layout.nodes.filter((n) => n.isLeaf && Math.abs(g.px(n.x) - edge) > 1.5).map((n) => `M${Math.round(g.px(n.x) * 10) / 10} ${Math.round(g.py(n.y + 0.5) * 10) / 10}H${edge}`).join("");
    const guidePath = guide ? <path key={`${side}guide`} d={guide} stroke={theme.grid} strokeWidth={0.5} fill="none" /> : null;
    return [guidePath, ...[...paths.entries()].map(([color, d]) => <path key={`${side}${color}`} d={d} stroke={color === UNKNOWN ? theme.branch : color} strokeWidth={1} fill="none" opacity={highlight ? 0.55 : 0.95} />)];
  };

  const leafStates = (layout, p) => {
    if (!layout) return null;
    if (p.kind === "snv") return snvLeafStates(snvData, layout.leaves, p.vi, cellIndex);
    return eventLeafStates(p.event, layout.leaves);
  };

  const drawPaint = (layout, g, x0) => {
    if (!layout || !g) return null;
    const h = Math.max(1, (g.py(1) - g.py(0)) - (g.py(1) - g.py(0) > 3 ? 0.5 : 0));
    const out = [];
    paints.forEach((p, k) => {
      const st = leafStates(layout, p);
      [[1, colors.alt], [0, colors.ref], [-1, colors.none]].forEach(([val, fill]) => {
        rowRuns([...st.keys()].filter((r) => st[r] === val)).forEach(([r0, r1]) => {
          out.push(<rect key={`${p.key}${val}${r0}`} x={x0 + k * DOT} y={g.py(r0)} width={DOT - 1} height={Math.max(1, g.py(r1 + 1) - g.py(r0) - (h > 2 ? 0.5 : 0))} fill={fill} />);
        });
      });
    });
    return out;
  };

  const linkPaths = useMemo(() => {
    if (!showLinks || !gA || !gB) return null;
    const x0 = mid0;
    const x1 = mid1;
    const by = new Map();
    links.forEach((l) => {
      const color = colorOfClone(cloneOf(l.id));
      const y0 = gA.py(l.a + 0.5);
      const y1 = gB.py(l.b + 0.5);
      const m = (x0 + x1) / 2;
      const on = active(l.id);
      const key = `${color}|${on ? 1 : 0}`;
      by.set(key, `${by.get(key) || ""}M${x0} ${Math.round(y0 * 10) / 10}C${m} ${Math.round(y0 * 10) / 10} ${m} ${Math.round(y1 * 10) / 10} ${x1} ${Math.round(y1 * 10) / 10}`);
    });
    return [...by.entries()];
  }, [showLinks, links, gA, gB, highlight, cloneColors, cellById, nP, treeW, mid0, mid1]); // eslint-disable-line react-hooks/exhaustive-deps

  const svgRef = useRef(null);
  const locate = (e) => {
    const box = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * totalW;
    const y = ((e.clientY - box.top) / box.height) * (H);
    const left = x < totalW / 2;
    const layout = left ? layoutA : layoutB;
    const g = left ? gA : gB;
    if (!layout || !g) return null;
    const row = Math.min(g.n - 1, Math.max(0, Math.floor(((y - pad) / (H - 2 * pad)) * g.n)));
    const dataX = left ? ((x - xA0) / (treeW - 2)) * g.maxX : ((totalW - x) / (treeW - 2)) * g.maxX;
    const inTree = left ? x <= xA1 : x >= xB1;
    return { side: left ? "A" : "B", layout, row, dataX, inTree, id: layout.leaves[row] };
  };
  const onMove = (e) => {
    const hit = locate(e);
    setHover(hit ? { id: hit.id, x: e.clientX, y: e.clientY, lines: null } : null);
  };
  const onClick = (e) => {
    const hit = locate(e);
    if (!hit || !hit.inTree) return;
    const node = cladeAt(hit.layout, hit.row, hit.dataX);
    if (node == null) return;
    const ids = cladeCells(hit.layout, node);
    setPick((cur) => (cur && cur.side === hit.side && cur.node === node ? null : { side: hit.side, node, cells: new Set(ids) }));
  };

  // matrix columns: same order and site filters as the Single-Cell tab (shared store), ordered on each matrix's own tree
  const matrixColumns = (layout, on) => {
    if (!on || !snvCalls || !layout) return null;
    const rows = rowMap(layout.leaves, snvCalls.cells);
    const all = snvOrder === "tree" ? treeColumnOrder(snvCalls, layout, rows) : snvColumnOrder(snvCalls, snvOrder);
    return { rows, columns: filterSnvColumns(snvCalls, all, siteFilter) };
  };
  const matA = useMemo(() => matrixColumns(layoutA, sides.includes("A")), [snvCalls, layoutA, snvOrder, siteFilter.snvCategories, siteFilter.snvCellphyOnly, siteFilter.snvDriversOnly, siteFilter.snvSiteIds, siteFilter.snvMinCladeScore, matrixMode, showMatrix]); // eslint-disable-line react-hooks/exhaustive-deps
  const matB = useMemo(() => matrixColumns(layoutB, sides.includes("B")), [snvCalls, layoutB, snvOrder, siteFilter.snvCategories, siteFilter.snvCellphyOnly, siteFilter.snvDriversOnly, siteFilter.snvSiteIds, siteFilter.snvMinCladeScore, matrixMode, showMatrix]); // eslint-disable-line react-hooks/exhaustive-deps
  const markedRows = (layout) => {
    const r = rowsOf(layout);
    const out = new Set();
    if (pick) pick.cells.forEach((id) => r.has(id) && out.add(r.get(id)));
    if (hover && r.has(hover.id)) out.add(r.get(hover.id));
    return out;
  };
  const hoverMatrix = (layout) => (row, lines, event) => setHover(row == null || row < 0 || !layout.leaves[row] ? null : { id: layout.leaves[row], x: event.clientX, y: event.clientY, lines });
  const paintSite = (_row, c) => setPainted((cur) => (cur.includes(`s:${c}`) ? cur : [...cur, `s:${c}`].slice(-MAX_PAINTED)));
  const setLayout = (patch) => dispatch(singleCellActions.updateLayout(patch));
  const renderMatrix = (layout, mat, x0, hdrSet) =>
    mat && layout ? (
      <MutationSidePanel
        snv={snvCalls}
        rows={mat.rows}
        nRows={layout.leaves.length}
        columnOrder={mat.columns}
        metric={matrixMetric}
        max={matrixMax}
        width={mw}
        height={H}
        pixelRatio={pixelRatio}
        onRowClick={() => {}}
        onSiteClick={paintSite}
        onHover={hoverMatrix(layout)}
        onLeave={() => setHover(null)}
        axisHeight={18}
        groupOf={null}
        highlightRows={markedRows(layout)}
        categoryNode={hdrSet}
      />
    ) : null;

  const options = useMemo(() => {
    const snvHits = searchSnvs(variants, search).map((v) => ({ value: `s:${v.index}`, label: `${v.driver ? "[driver] " : ""}${snvLabel(v)}` }));
    const q = search.trim().toLowerCase();
    const evHits = eventList.filter((e) => !q || e.label.toLowerCase().includes(q)).slice(0, 60).map((e) => ({ value: `e:${e.key}`, label: `${e.label}${e.tier ? ` (tier ${e.tier})` : ""}` }));
    const have = new Set([...snvHits, ...evHits].map((o) => o.value));
    const extra = paints.filter((p) => !have.has(p.key)).map((p) => ({ value: p.key, label: p.label }));
    return [
      ...(evHits.length ? [{ label: "Filtered events / drivers", options: evHits }] : []),
      ...(snvHits.length ? [{ label: "SNVs (drivers first)", options: snvHits }] : []),
      ...(extra.length ? [{ label: "Selected", options: extra }] : []),
    ];
  }, [variants, eventList, search, paints]);

  if (!trees.length || trees.length < 2) return <Alert type="info" showIcon message="No alternative phylogenies were exported for this patient." />;
  const treeOpts = trees.map((t) => ({ value: t.name, label: `${t.label || t.name}${t.n_matched != null && t.name !== CURRENT_TREE ? ` (${t.n_matched} cells)` : ""}` }));
  const loading = treeA.status === "loading" || treeB.status === "loading";
  const labelOf = (name) => trees.find((t) => t.name === name)?.label || name;

  const conc = (c, name, layout) => (
    <Card size="small" style={{ flex: 1, minWidth: 200 }}>
      <Statistic
        title={`${labelOf(name)}: median best-clade F1 (SNVs, >=10 carriers)`}
        value={c ? fmtF1(c.median) : "..."}
        suffix={c ? <span style={{ fontSize: TYPE.tick, color: theme.muted }}>{`n=${c.n}${c.sampled ? ` of ${c.eligible} (sampled)` : ""}`}</span> : null}
      />
      {layout ? <Text type="secondary" style={{ fontSize: TYPE.tick }}>{layout.leaves.length} cells in tree</Text> : null}
    </Card>
  );

  const hovCell = hover ? cellById.get(hover.id) : null;
  return (
    <div>
      <Card size="small" title="Compare phylogenies" extra={<Text type="secondary">same cells, two trees; lines join each cell; branch colour = clone</Text>}>
        <Space wrap size="middle" style={{ marginBottom: 8 }}>
          <span>Tree A <Select style={{ width: 210 }} value={a} options={treeOpts} onChange={(v) => { setNameA(v); setPick(null); }} /></span>
          <span>Tree B <Select style={{ width: 210 }} value={b} options={treeOpts} onChange={(v) => { setNameB(v); setPick(null); }} /></span>
          <span>Lines <Switch checked={showLinks} onChange={setShowLinks} /></span>
          <span>Hide normal cells <Switch checked={hideNormal} onChange={setHideNormal} /></span>
          <Tooltip title={t("components.single-cell.toolbar.clip-help")}><span>Shorten long branches <Switch checked={clip} onChange={setClip} disabled={cladogram} /></span></Tooltip>
          <span>Cladogram <Switch checked={cladogram} onChange={setCladogram} /></span>
          <span>SNV matrix <Switch checked={showMatrix} onChange={setShowMatrix} disabled={!snvData} /></span>
          {showMatrix && snvData ? (
            <Radio.Group size="small" value={matrixMode} onChange={(e) => setMatrixMode(e.target.value)} optionType="button" options={[{ value: "both", label: "A and B" }, { value: "A", label: "Align to A" }, { value: "B", label: "Align to B" }]} />
          ) : null}
          {pick ? <Button size="small" onClick={() => setPick(null)}>{`Clear clade (${pick.cells.size} cells)`}</Button> : null}
          {layoutA && layoutB && prepared ? <Text type="secondary">{`${nShared} shared cells, ${crossings.toLocaleString("en-US")} crossings (${prepared.before.toLocaleString("en-US")} before rotating)`}</Text> : null}
        </Space>
        {showMatrix && snvData ? (
          <Space wrap size="small" style={{ marginBottom: 8 }}>
            <Text type="secondary">{t("components.single-cell.toolbar.metric")}</Text>
            <Select size="small" style={{ width: 120 }} value={matrixMetric} onChange={setMetric} options={["vaf", "alt", "depth", ...(snvData.gt ? ["gt"] : [])].map((value) => ({ value, label: t(`components.single-cell.metric.${value}`) }))} />
            <Text type="secondary">{t("components.single-cell.toolbar.order")}</Text>
            <Select size="small" style={{ width: 150 }} value={snvOrder} onChange={(value) => dispatch(singleCellActions.updateSnvOrder(value))} options={["tree", "genomic", "prevalence", "catalog"].map((value) => ({ value, label: t(`components.single-cell.snv.order-${value}`) }))} />
            {Object.keys(categoryCounts).length ? (
              <Select
                size="small"
                mode="multiple"
                allowClear
                style={{ minWidth: 190 }}
                placeholder={t("components.single-cell.snv.all-sites")}
                value={siteFilter.snvCategories || []}
                onChange={(value) => setLayout({ snvCategories: value.length ? value : null })}
                options={SNV_CATEGORIES.filter((c) => categoryCounts[c.key]).map((c) => ({ value: c.key, label: `${t(`components.single-cell.snv.category-${c.key}`)} (${categoryCounts[c.key]})` }))}
              />
            ) : null}
            <Checkbox checked={Boolean(siteFilter.snvCellphyOnly)} onChange={(e) => setLayout({ snvCellphyOnly: e.target.checked })}>{t("components.single-cell.snv.cellphy-only")}</Checkbox>
            <Checkbox checked={Boolean(siteFilter.snvDriversOnly)} onChange={(e) => setLayout({ snvDriversOnly: e.target.checked })}>{t("components.single-cell.snv.drivers-only", { count: nDrivers })}</Checkbox>
            {hasCladeScores(snvData) ? (
              <Select
                size="small"
                style={{ width: 150 }}
                value={siteFilter.snvMinCladeScore || 0}
                onChange={(value) => setLayout({ snvMinCladeScore: value || null })}
                options={[0, 0.5, 0.7, 0.8, 0.9].map((value) => ({ value, label: value ? t("components.single-cell.snv.clade-score-min", { value }) : t("components.single-cell.snv.clade-score-any") }))}
              />
            ) : null}
            <Text type="secondary" style={{ fontSize: TYPE.tick }}>same sites and order as the Single-Cell tab; columns follow each matrix's own tree; click a site to paint it</Text>
          </Space>
        ) : null}
        <div style={{ marginBottom: 8 }}>
          <Select
            mode="multiple"
            showSearch
            filterOption={false}
            onSearch={setSearch}
            value={painted}
            options={options}
            onChange={(v) => setPainted(v.slice(0, MAX_PAINTED))}
            style={{ width: "100%" }}
            placeholder={`Paint mutations on both trees (up to ${MAX_PAINTED}): search gene, protein, position, or driver event`}
            maxTagCount="responsive"
            optionFilterProp="label"
          />
          <Text type="secondary" style={{ fontSize: TYPE.tick }}>
            <span style={{ color: colors.alt }}>alt</span> / <span style={{ color: colors.ref }}>ref</span> / no coverage; columns follow the order selected. Click a branch to highlight its clade in both trees.
          </Text>
        </div>
        {paints.some((p) => p.kind === "snv") && fullA && fullB ? (
          <div style={{ marginBottom: 8, fontSize: TYPE.tick }}>
            {paints.filter((p) => p.kind === "snv").map((p) => {
              const fa = snvConcordance(snvData, fullA, p.vi);
              const fb = snvConcordance(snvData, fullB, p.vi);
              return (
                <Tag key={p.key} style={{ marginBottom: 2 }}>
                  {p.label}: F1 {fmtF1(fa.score)} ({fa.carriers} alt) vs {fmtF1(fb.score)} ({fb.carriers} alt)
                </Tag>
              );
            })}
          </div>
        ) : null}
        <div ref={wrapRef} style={{ position: "relative" }}>
          {loading ? <Spin /> : null}
          {treeA.status === "error" || treeB.status === "error" || treeA.status === "missing" || treeB.status === "missing" ? (
            <Alert type="warning" showIcon message="One of the selected trees could not be loaded." />
          ) : null}
          {layoutA && layoutB ? (
            <div style={{ position: "relative", width: totalW, height: H + 22, marginTop: 18, maxWidth: "100%" }}>
            <svg ref={svgRef} width={totalW} height={H} viewBox={`0 0 ${totalW} ${H}`} style={{ background: theme.panel, display: "block", maxWidth: "100%" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick}>
              {linkPaths
                ? linkPaths.map(([key, d]) => {
                    const [color, on] = key.split("|");
                    return <path key={key} d={d} stroke={color} strokeWidth={on === "1" ? 0.8 : 0.4} fill="none" opacity={highlight ? (on === "1" ? 0.9 : 0.06) : 0.35} />;
                  })
                : null}
              {drawTree(layoutA, gA, "A")}
              {drawTree(layoutB, gB, "B")}
              {drawPaint(layoutA, gA, pA0)}
              {drawPaint(layoutB, gB, pB0)}
              {hover && gA && gB ? (
                <>
                  {layoutA.leaves.includes(hover.id) ? <line x1={xA0} x2={pA0 + nP * DOT} y1={gA.py(rowsOf(layoutA).get(hover.id) + 0.5)} y2={gA.py(rowsOf(layoutA).get(hover.id) + 0.5)} stroke={theme.hover} strokeWidth={1.5} /> : null}
                  {layoutB.leaves.includes(hover.id) ? <line x1={pB0} x2={totalW} y1={gB.py(rowsOf(layoutB).get(hover.id) + 0.5)} y2={gB.py(rowsOf(layoutB).get(hover.id) + 0.5)} stroke={theme.hover} strokeWidth={1.5} /> : null}
                  {layoutA.leaves.includes(hover.id) && layoutB.leaves.includes(hover.id) ? (
                    <line x1={mid0} x2={mid1} y1={gA.py(rowsOf(layoutA).get(hover.id) + 0.5)} y2={gB.py(rowsOf(layoutB).get(hover.id) + 0.5)} stroke={theme.hover} strokeWidth={1.8} />
                  ) : null}
                </>
              ) : null}
            </svg>
            {sides.includes("A") ? (
              <>
                <div ref={setHdrA} style={{ position: "absolute", left: mA0, top: -16, width: mw, height: 15 }} />
                <div style={{ position: "absolute", left: mA0, top: 0, width: mw }}>{renderMatrix(layoutA, matA, mA0, hdrA)}</div>
              </>
            ) : null}
            {sides.includes("B") ? (
              <>
                <div ref={setHdrB} style={{ position: "absolute", left: mB0, top: -16, width: mw, height: 15 }} />
                <div style={{ position: "absolute", left: mB0, top: 0, width: mw }}>{renderMatrix(layoutB, matB, mB0, hdrB)}</div>
              </>
            ) : null}
            </div>
          ) : null}
          {hover && hovCell !== undefined ? (
            <div style={{ position: "fixed", left: hover.x + 12, top: hover.y + 12, background: theme.raised, color: theme.text, border: `1px solid ${theme.border}`, padding: "4px 8px", fontSize: TYPE.tick, pointerEvents: "none", zIndex: 1000, borderRadius: 4 }}>
              <div><b>{hover.id}</b>{hovCell?.clone_id != null ? ` (clone ${hovCell.clone_id})` : ""}</div>
              {(hover.lines || []).map(([k, v]) => <div key={k}>{k}: {`${v}`}</div>)}
              {paints.map((p) => {
                const st = p.kind === "snv" ? snvLeafStates(snvData, [hover.id], p.vi, cellIndex)[0] : eventLeafStates(p.event, [hover.id])[0];
                return <div key={p.key}>{p.label}: {st === 1 ? "alt" : st === 0 ? "ref" : "no coverage"}</div>;
              })}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: TYPE.label, color: theme.textSecondary }}>
          <span>{`A: ${labelOf(a)}`}</span>
          <span>{`B (mirrored): ${labelOf(b)}`}</span>
        </div>
      </Card>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {conc(concA, a, fullA)}
        {conc(concB, b, fullB)}
      </div>
    </div>
  );
}
