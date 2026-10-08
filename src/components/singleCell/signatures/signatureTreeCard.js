import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Checkbox, Empty, InputNumber, Progress, Select, Space, Table, Tooltip, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import PhylogenyCanvas from "../phylogenyCanvas";
import useContainerWidth from "../useContainerWidth";
import usePixelRatio from "../usePixelRatio";
import useTreeView from "../useTreeView";
import SvgExportButton from "../svgExportButton";
import singleCellActions from "../../../redux/singleCell/actions";
import { AetiologyLegend, loadCosmic, signatureColorOf } from "../signaturePanel";
import { bootstrapShares, cosine, fitSignatures, nnls, sbs96Counts } from "../../../helpers/singleCell/signatures";
import { rowMap } from "../../../helpers/singleCell/matrix";
import { sitesSeenInRows } from "../../../helpers/singleCell/snvSites";
import { cutTree, labelRuns } from "../../../helpers/singleCell/treeGroups";

const { Text } = Typography;
const TREE_WIDTH = 260;
const GAP = 8;
const LABEL_W = 150;
const MIN_ROW = 26;
const MAX_ROW = 44;
const pct = d3.format(".0%");

/**
 * SBS signatures per clade on the phylogeny. Each clade (clone, or the tree
 * cut into k clades) gets a stacked bar of its fitted signatures, drawn at
 * the clade's rows, labelled with its name, site count and cosine
 * similarity to the truncal profile. The bar height follows the clade's
 * share of cells so the tree and bars line up.
 */
export default function SignatureTreeCard() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { snv, signatures, cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const { order, treeLayout, cellById } = useTreeView();
  const [containerRef, width] = useContainerWidth(900);
  const pixelRatio = usePixelRatio();
  const [mode, setMode] = useState("clones");
  const [k, setK] = useState(4);
  const [fits, setFits] = useState(null);
  const [progress, setProgress] = useState(null);
  const [hoverRange, setHoverRange] = useState(null);
  const [focus, setFocus] = useState(null); // clade key for the clade-vs-rest table
  const [focusStats, setFocusStats] = useState(null);
  const snvData = snv.status === "ok" ? snv.data : null;

  const nRows = order.length;
  const rowOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);
  const selectedRows = useMemo(() => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)), [selectedCellIds, rowOf]);
  const hoverRow = hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null;
  const leafClones = useMemo(() => order.map((id) => cellById.get(id)?.clone_id ?? null), [order, cellById]);

  const clades = useMemo(() => {
    if (!treeLayout) return [];
    if (mode === "clones") return labelRuns(leafClones).map((r, i) => ({ key: `${r.label}:${i}`, label: r.label ?? "–", first: r.first, last: r.last, clone: r.label }));
    return cutTree(treeLayout, k).map((c, i) => ({ key: `cut:${c.node}`, label: `${t("components.single-cell.bars.clade")} ${i + 1}`, first: c.first, last: c.last }));
  }, [treeLayout, mode, k, leafClones, t]);

  // Fit each clade's pooled sites, plus the truncal profile for the cosine column.
  const cladesKey = clades.map((c) => `${c.key}:${c.first}-${c.last}`).join("|");
  useEffect(() => {
    if (!snvData || !clades.length) return undefined;
    let active = true;
    (async () => {
      setProgress(0);
      const reference = await loadCosmic();
      const known = new Set((signatures.status === "ok" ? signatures.data?.sets || [] : []).flatMap((s) => (s.activities || []).map((a) => a.signature)));
      const subset = reference.names.map((n, j) => [n, j]).filter(([n]) => known.has(n));
      const rows = rowMap(order, snvData.cells);
      const truncal = sbs96Counts(snvData.variants.filter((v) => v.category === "truncal").map((v) => v.context).filter(Boolean)).counts;
      const out = {};
      for (let i = 0; i < clades.length; i += 1) {
        const c = clades[i];
        const cellRows = d3.range(c.first, c.last + 1).map((r) => rows[r]).filter((r) => r >= 0);
        const seen = sitesSeenInRows(snvData, cellRows);
        const contexts = [...seen].map((s) => snvData.variants[s].context).filter(Boolean);
        const { counts, used } = sbs96Counts(contexts);
        let activities = [];
        if (used >= 10) {
          if (subset.length >= 2) {
            const x = nnls(subset.map(([, j]) => reference.columns[j]), counts);
            activities = subset.map(([n], q) => ({ signature: n, activity: x[q] })).filter((a) => a.activity > 0);
          } else activities = fitSignatures(counts, reference).activities;
        }
        out[c.key] = { activities: activities.sort((a, b) => b.activity - a.activity), n: used, cosTruncal: cosine(counts, truncal), contexts, counts };
        if (!active) return;
        setProgress(Math.round((100 * (i + 1)) / clades.length));
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!active) return;
      setFits(out);
      setProgress(null);
    })().catch(() => active && setProgress(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snvData, cladesKey, signatures]);

  // Clade vs rest: shares with bootstrap intervals for the focused clade and all other tumor cells
  useEffect(() => {
    if (!focus || !fits || !fits[focus] || !snvData) return undefined;
    let active = true;
    (async () => {
      const reference = await loadCosmic();
      const rows = rowMap(order, snvData.cells);
      const inClade = clades.find((c) => c.key === focus);
      if (!inClade) return;
      const restRows = order.map((_, r) => r).filter((r) => (r < inClade.first || r > inClade.last) && !/^normal$/i.test(`${leafClones[r] || ""}`)).map((r) => rows[r]).filter((r) => r >= 0);
      const seen = sitesSeenInRows(snvData, restRows);
      const restContexts = [...seen].map((s) => snvData.variants[s].context).filter(Boolean);
      const names = [...new Set([...fits[focus].activities.map((a) => a.signature)])];
      const known = new Set((signatures.status === "ok" ? signatures.data?.sets || [] : []).flatMap((s) => (s.activities || []).map((a) => a.signature)));
      const subset = reference.names.map((n, j) => [n, j]).filter(([n]) => known.has(n) || names.includes(n));
      const { counts: restCounts, used: restUsed } = sbs96Counts(restContexts);
      const xr = nnls(subset.map(([, j]) => reference.columns[j]), restCounts);
      const restTotal = xr.reduce((a, b) => a + b, 0) || 1;
      const restShare = Object.fromEntries(subset.map(([n], k) => [n, xr[k] / restTotal]));
      const cladeTotal = fits[focus].activities.reduce((s, a) => s + a.activity, 0) || 1;
      const sigNames = subset.map(([n]) => n);
      const ciClade = bootstrapShares(fits[focus].contexts, reference, sigNames, 80);
      const ciRest = bootstrapShares(restContexts, reference, sigNames, 80);
      if (!active) return;
      const rowsOut = sigNames
        .map((n) => {
          const clade = (fits[focus].activities.find((a) => a.signature === n)?.activity || 0) / cladeTotal;
          const rest = restShare[n] || 0;
          const separated = ciClade[n] && ciRest[n] && (ciClade[n].lo > ciRest[n].hi || ciClade[n].hi < ciRest[n].lo);
          return { signature: n, clade, rest, diff: clade - rest, ciClade: ciClade[n], ciRest: ciRest[n], separated };
        })
        .filter((r) => r.clade > 0.01 || r.rest > 0.01)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      setFocusStats({ rows: rowsOut, nClade: fits[focus].n, nRest: restUsed, cos: cosine(fits[focus].counts, restCounts) });
    })().catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, fits]);

  const hoverRef = useRef(null);
  const share = (id) => {
    if (hoverRef.current === id) return;
    hoverRef.current = id;
    dispatch(singleCellActions.updateHover(id));
  };
  if (!treeLayout || !snvData) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.signatures.no-contexts")} />;

  // rows: at least MIN_ROW px per clade so labels fit; the tree stretches with it
  const rowH = Math.max(MIN_ROW / Math.max(1, d3.min(clades, (c) => c.last - c.first + 1) || 1), Math.min(MAX_ROW, 480 / Math.max(1, nRows)));
  const height = Math.max(200, Math.round(nRows * rowH));
  const barX = TREE_WIDTH + GAP + LABEL_W;
  const barW = Math.max(200, width - barX - 150);
  const allSigs = [...new Set(Object.values(fits || {}).flatMap((f) => f.activities.map((a) => a.signature)))];
  const selectClade = (c, e) => {
    setFocus(c.key);
    const ids = order.slice(c.first, c.last + 1);
    dispatch(singleCellActions.updateSelection(e?.metaKey || e?.ctrlKey || e?.shiftKey ? [...selectedCellIds, ...ids] : ids));
  };

  return (
    <Card
      size="small"
      title={<Space><ApartmentOutlined />{t("components.single-cell.signatures.tree-title")}</Space>}
      extra={
        <Space wrap>
          <Select
            size="small"
            style={{ width: 170 }}
            value={mode}
            onChange={setMode}
            options={[
              { value: "clones", label: t("components.single-cell.bars.per-clone") },
              { value: "cut", label: t("components.single-cell.bars.per-clade") },
            ]}
          />
          {mode === "cut" && <InputNumber size="small" min={2} max={30} value={k} onChange={(v) => setK(v || 2)} style={{ width: 64 }} />}
          <Tooltip title={t("components.single-cell.toolbar.clip-help")}>
            <Checkbox checked={Boolean(layout.clipBranches)} onChange={(e) => dispatch(singleCellActions.updateLayout({ clipBranches: e.target.checked }))}>
              {t("components.single-cell.toolbar.clip")}
            </Checkbox>
          </Tooltip>
          <SvgExportButton containerRef={containerRef} name="signatures-tree" />
        </Space>
      }
    >
      <div ref={containerRef}>
        {progress != null && <Progress percent={progress} size="small" style={{ width: 240 }} />}
        <div style={{ display: "flex", gap: GAP, alignItems: "flex-start" }} onMouseLeave={() => share(null)}>
          <PhylogenyCanvas
            layout={treeLayout}
            nRows={nRows}
            width={TREE_WIDTH}
            height={height}
            pixelRatio={pixelRatio}
            leafClones={leafClones}
            cloneColors={cloneColors}
            selectedRows={selectedRows}
            hoverRow={hoverRow}
            hoverRange={hoverRange}
            onSelectRange={([a, b], e) => {
              const ids = order.slice(a, b + 1);
              dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...selectedCellIds, ...ids] : ids));
            }}
            onHoverNode={(node) => {
              if (!node) {
                setHoverRange(null);
                return share(null);
              }
              setHoverRange(node.isLeaf ? null : [node.firstLeaf, node.lastLeaf]);
              return share(node.isLeaf ? order[node.firstLeaf] : null);
            }}
          />
          <svg width={Math.max(320, width - TREE_WIDTH - GAP)} height={height}>
            {clades.map((c, i) => {
              const y0 = c.first * rowH;
              const h = (c.last - c.first + 1) * rowH;
              const fit = fits?.[c.key];
              const total = fit ? fit.activities.reduce((s, a) => s + a.activity, 0) || 1 : 1;
              const cy = y0 + h / 2;
              let x = barX - TREE_WIDTH - GAP;
              const barH = Math.max(10, Math.min(h - 4, 26));
              const selected = selectedRows.size && d3.range(c.first, c.last + 1).some((r) => selectedRows.has(r));
              return (
                <g key={c.key} style={{ cursor: "pointer" }} onClick={(e) => selectClade(c, e)}>
                  <rect x={0} y={y0} width={width} height={h} fill={i % 2 ? "#fafafa" : "#f5f5f5"} fillOpacity={selected ? 0.2 : 0.7} />
                  <rect x={0} y={y0 + 1} width={5} height={Math.max(1, h - 2)} fill={(c.clone != null && cloneColors[c.clone]) || "#8c8c8c"} />
                  <text x={10} y={cy - 6} fontSize={13} fontWeight={600} fill="#262626">{c.label.length > 18 ? `${c.label.slice(0, 17)}…` : c.label}</text>
                  <text x={10} y={cy + 9} fontSize={11} fill="#8c8c8c">
                    {t("components.single-cell.signatures.clade-meta", { cells: c.last - c.first + 1, sites: fit?.n ?? "…" })}
                  </text>
                  {fit && fit.activities.length ? (
                    fit.activities.map((a) => {
                      const w = (barW * a.activity) / total;
                      const rect = (
                        <g key={a.signature}>
                          <rect x={x} y={cy - barH / 2} width={Math.max(0, w - 0.6)} height={barH} fill={signatureColorOf(a.signature)} rx={1} />
                          {w > 40 && (
                            <text x={x + w / 2} y={cy} dy="0.35em" textAnchor="middle" fontSize={11} fill="#fff" pointerEvents="none">
                              {a.signature}
                            </text>
                          )}
                          <title>{`${c.label} · ${a.signature}: ${pct(a.activity / total)} (${Math.round(a.activity)} of ${fit.n} sites)`}</title>
                        </g>
                      );
                      x += w;
                      return rect;
                    })
                  ) : (
                    <text x={barX - TREE_WIDTH - GAP} y={cy} dy="0.35em" fontSize={11} fill="#bfbfbf">{fit ? t("components.single-cell.signatures.too-few") : "…"}</text>
                  )}
                  {fit && Number.isFinite(fit.cosTruncal) && fit.n >= 10 && (
                    <text x={barX - TREE_WIDTH - GAP + barW + 8} y={cy} dy="0.35em" fontSize={11} fill={fit.cosTruncal < 0.8 ? "#cf1322" : "#595959"}>
                      {t("components.single-cell.signatures.cos-truncal", { value: pct(fit.cosTruncal) })}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        {focus && fits?.[focus] && (
          <div style={{ marginTop: 10 }}>
            <Text strong>{t("components.single-cell.signatures.clade-vs-rest", { clade: clades.find((c) => c.key === focus)?.label || focus })}</Text>
            {focusStats ? (
              <>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.signatures.clade-vs-rest-meta", { nClade: focusStats.nClade, nRest: focusStats.nRest, cos: pct(focusStats.cos) })}</Text></div>
                <Table
                  size="small"
                  rowKey="signature"
                  pagination={false}
                  style={{ maxWidth: 720 }}
                  dataSource={focusStats.rows}
                  columns={[
                    { title: t("components.single-cell.signatures.signature"), dataIndex: "signature", width: 90, render: (s) => <span><span className="sc-swatch" style={{ background: signatureColorOf(s) }} />{s}</span> },
                    { title: t("components.single-cell.signatures.clade-share"), dataIndex: "clade", width: 150, render: (v, r) => `${pct(v)}${r.ciClade ? ` [${pct(r.ciClade.lo)}–${pct(r.ciClade.hi)}]` : ""}` },
                    { title: t("components.single-cell.signatures.rest-share"), dataIndex: "rest", width: 150, render: (v, r) => `${pct(v)}${r.ciRest ? ` [${pct(r.ciRest.lo)}–${pct(r.ciRest.hi)}]` : ""}` },
                    { title: "Δ", dataIndex: "diff", width: 80, render: (v, r) => <span style={{ color: r.separated ? (v > 0 ? "#cf1322" : "#1d39c4") : undefined, fontWeight: r.separated ? 600 : 400 }}>{`${v > 0 ? "+" : ""}${pct(v)}${r.separated ? " *" : ""}`}</span> },
                  ]}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.signatures.clade-vs-rest-help")}</Text>
              </>
            ) : (
              <div><Text type="secondary">…</Text></div>
            )}
          </div>
        )}
        {allSigs.length > 0 && <AetiologyLegend rows={[{ activities: allSigs.map((s) => ({ signature: s })) }]} />}
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.signatures.tree-help")}</Text>
      </div>
    </Card>
  );
}
