import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Checkbox, Empty, InputNumber, Segmented, Select, Slider, Space, Table, Tooltip, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import PhylogenyCanvas from "../phylogenyCanvas";
import useContainerWidth from "../useContainerWidth";
import usePixelRatio from "../usePixelRatio";
import useTreeView from "../useTreeView";
import SvgExportButton from "../svgExportButton";
import useSignatureModel from "./useSignatureModel";
import singleCellActions from "../../../redux/singleCell/actions";
import { AetiologyLegend, signatureColorOf } from "../signaturePanel";
import { signatureBurden } from "../../../helpers/singleCell/signatureAssign";
import { rowMap } from "../../../helpers/singleCell/matrix";
import { sitesSeenInRows } from "../../../helpers/singleCell/snvSites";
import { cutTree, labelRuns } from "../../../helpers/singleCell/treeGroups";
import { fisherExact } from "../../../helpers/singleCell/tests";
import HintLine, { Provenance } from "../hintLine";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const TREE_WIDTH = 240;
const GAP = 8;
const LABEL_W = 150;
const pct = d3.format(".0%");

/**
 * Signature burden along the phylogeny. One joint fit for the patient
 * assigns every mutation to a signature; each clade's bar counts the unique
 * mutations (sites with alt reads in its cells) per signature, as counts or
 * shares. Height is adjustable; clicking a clade gives a clade-vs-rest table
 * with Fisher tests per signature.
 */
export default function SignatureTreeCard() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { snv, cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const { order, treeLayout, cellById } = useTreeView();
  const [containerRef, width] = useContainerWidth(900);
  const pixelRatio = usePixelRatio();
  const model = useSignatureModel();
  const [mode, setMode] = useState("clones");
  const [k, setK] = useState(4);
  const [unit, setUnit] = useState("count");
  const [siteSet, setSiteSet] = useState("all");
  const [hoverRange, setHoverRange] = useState(null);
  const [focus, setFocus] = useState(null);
  const height = layout.sigTreeHeight || (mode === "cells" ? Math.max(420, Math.min(1400, order.length * 4)) : 420);
  const snvData = snv.status === "ok" ? snv.data : null;

  const nRows = order.length;
  const rowOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);
  const selectedRows = useMemo(() => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)), [selectedCellIds, rowOf]);
  const hoverRow = hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null;
  const leafClones = useMemo(() => order.map((id) => cellById.get(id)?.clone_id ?? null), [order, cellById]);

  const clades = useMemo(() => {
    if (!treeLayout) return [];
    if (mode === "cells") return order.map((id, i) => ({ key: id, label: id, first: i, last: i, clone: leafClones[i] }));
    if (mode === "clones") return labelRuns(leafClones).map((r, i) => ({ key: `${r.label}:${i}`, label: r.label ?? "–", first: r.first, last: r.last, clone: r.label }));
    return cutTree(treeLayout, k).map((c, i) => ({ key: `cut:${c.node}`, label: `${t("components.single-cell.bars.clade")} ${i + 1}`, first: c.first, last: c.last }));
  }, [treeLayout, mode, k, leafClones, order, t]);

  // burden per clade: unique sites (optionally only post-trunk sites) seen in its cells, by assigned signature
  const burdens = useMemo(() => {
    if (!snvData || !model.ready) return null;
    const rows = rowMap(order, snvData.cells);
    const keep = (c) => siteSet === "all" || (siteSet === "subclonal" ? snvData.variants[c].category !== "truncal" : snvData.variants[c].category === siteSet);
    const out = {};
    clades.forEach((c) => {
      const cellRows = d3.range(c.first, c.last + 1).map((r) => rows[r]).filter((r) => r >= 0);
      const seen = [...sitesSeenInRows(snvData, cellRows)].filter(keep);
      out[c.key] = { ...signatureBurden(seen, model.assignment), sites: seen };
    });
    return out;
  }, [snvData, model, order, clades, siteSet]);
  const allSigs = useMemo(() => {
    if (!burdens) return [];
    const totals = {};
    Object.values(burdens).forEach((b) => Object.entries(b.counts).forEach(([s, n]) => (totals[s] = (totals[s] || 0) + n)));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [burdens]);
  const maxCount = burdens ? d3.max(Object.values(burdens), (b) => b.assigned) || 1 : 1;

  // clade vs rest: Fisher's exact test per signature on assigned-mutation counts
  const focusStats = useMemo(() => {
    if (!focus || !burdens?.[focus] || !snvData || !model.ready) return null;
    const inClade = burdens[focus];
    const restSites = new Set();
    Object.entries(burdens).forEach(([key, b]) => key !== focus && b.sites.forEach((s) => restSites.add(s)));
    inClade.sites.forEach((s) => restSites.delete(s));
    const rest = signatureBurden([...restSites], model.assignment);
    const rows = allSigs
      .map((s) => {
        const a = inClade.counts[s] || 0;
        const b = inClade.assigned - a;
        const c = rest.counts[s] || 0;
        const d = rest.assigned - c;
        const { p, oddsRatio } = fisherExact(a, b, c, d);
        return { signature: s, inClade: a, inShare: inClade.assigned ? a / inClade.assigned : 0, rest: c, restShare: rest.assigned ? c / rest.assigned : 0, p, oddsRatio };
      })
      .sort((a, b) => a.p - b.p);
    return { rows, nClade: inClade.assigned, nRest: rest.assigned };
  }, [focus, burdens, allSigs, snvData, model]);

  const hoverRef = useRef(null);
  const share = (id) => {
    if (hoverRef.current === id) return;
    hoverRef.current = id;
    dispatch(singleCellActions.updateHover(id));
  };
  if (!treeLayout || !snvData) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.signatures.no-contexts")} />;

  const rowH = height / Math.max(1, nRows);
  const barX = TREE_WIDTH + GAP + LABEL_W;
  const barW = Math.max(200, width - barX - 60);
  const xScale = d3.scaleLinear().domain([0, unit === "count" ? maxCount : 1]).range([0, barW]);
  const selectClade = (c, e) => {
    setFocus(c.key);
    const ids = order.slice(c.first, c.last + 1);
    dispatch(singleCellActions.updateSelection(e?.metaKey || e?.ctrlKey || e?.shiftKey ? [...selectedCellIds, ...ids] : ids));
  };

  return (
    <Card
      size="small"
      title={<Space><ApartmentOutlined />{t("components.single-cell.signatures.tree-title")}<Provenance id="signatureTree" /></Space>}
      extra={
        <Space wrap>
          <Select size="small" style={{ width: 150 }} value={mode} onChange={setMode} options={[{ value: "cells", label: t("components.single-cell.bars.per-cell") }, { value: "clones", label: t("components.single-cell.bars.per-clone") }, { value: "cut", label: t("components.single-cell.bars.per-clade") }]} />
          {mode === "cut" && <InputNumber size="small" min={2} max={30} value={k} onChange={(v) => setK(v || 2)} style={{ width: 64 }} />}
          <Select size="small" style={{ width: 150 }} value={siteSet} onChange={setSiteSet} options={[{ value: "all", label: t("components.single-cell.signatures.sites-all") }, { value: "subclonal", label: t("components.single-cell.signatures.sites-post-trunk") }, { value: "truncal", label: t("components.single-cell.snv.category-truncal") }, { value: "private", label: t("components.single-cell.snv.category-private") }]} />
          <Segmented size="small" value={unit} onChange={setUnit} options={[{ value: "count", label: t("components.single-cell.signatures.unit-count") }, { value: "share", label: t("components.single-cell.signatures.unit-share") }]} />
          <Space size={4}>
            <Text type="secondary">{t("components.single-cell.signatures.height")}</Text>
            <Slider min={200} max={1400} step={20} value={height} onChange={(v) => dispatch(singleCellActions.updateLayout({ sigTreeHeight: v }))} style={{ width: 120, margin: "0 6px" }} />
          </Space>
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
        <Text type="secondary" style={{ fontSize: 13 }}>
          {model.ready
            ? t("components.single-cell.signatures.model-note", { source: model.source === "backend" ? "SigProfilerAssignment" : t("components.single-cell.signatures.browser-short"), list: model.activities.filter((a) => a.activity > 0).map((a) => a.signature).join(", ") })
            : t("components.single-cell.signatures.model-loading")}
        </Text>
        <div style={{ display: "flex", gap: GAP, alignItems: "flex-start", marginTop: 6 }} onMouseLeave={() => share(null)}>
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
              const b = burdens?.[c.key];
              const cy = y0 + h / 2;
              const barH = mode === "cells" ? Math.max(1, h - (h > 3 ? 1 : 0)) : Math.max(6, Math.min(h - 4, 26));
              const selected = selectedRows.size && d3.range(c.first, c.last + 1).some((r) => selectedRows.has(r));
              const bx = LABEL_W;
              let x = 0;
              const total = b ? (unit === "count" ? 1 : Math.max(1, b.assigned)) : 1;
              return (
                <g key={c.key} style={{ cursor: "pointer" }} onClick={(e) => selectClade(c, e)} onMouseEnter={() => mode === "cells" && share(c.key)}>
                  <rect x={0} y={y0} width={width} height={h} fill={focus === c.key ? "#e6f4ff" : mode === "cells" ? "#ffffff" : i % 2 ? "#fafafa" : "#f5f5f5"} fillOpacity={selected ? 0.5 : 0.8} />
                  {mode === "cells" && hoverRow === c.first && <rect x={0} y={y0} width={width} height={h} fill="rgba(22,119,255,0.18)" />}
                  <rect x={0} y={y0 + 1} width={5} height={Math.max(1, h - 2)} fill={(c.clone != null && cloneColors[c.clone]) || INK.faint} />
                  {mode === "cells" && h < 22 ? (
                    h >= 9 && <text x={10} y={cy} dy="0.35em" fontSize={Math.min(10, h - 1)} fill={INK.textSecondary}>{c.label}</text>
                  ) : h >= 22 ? (
                    <>
                      <text x={10} y={cy - 5} fontSize={TYPE.label} fontWeight={600} fill={INK.text}>{c.label.length > 18 ? `${c.label.slice(0, 17)}…` : c.label}</text>
                      <text x={10} y={cy + 9} fontSize={11} fill={INK.muted}>{t("components.single-cell.signatures.clade-meta2", { cells: c.last - c.first + 1, n: b?.assigned ?? "…" })}</text>
                    </>
                  ) : (
                    <text x={10} y={cy} dy="0.35em" fontSize={11} fill={INK.text}>{c.label}</text>
                  )}
                  {b &&
                    allSigs.map((s) => {
                      const n = b.counts[s] || 0;
                      if (!n) return null;
                      const w = xScale(n / total);
                      const rect = (
                        <g key={s}>
                          <rect x={bx + x} y={cy - barH / 2} width={Math.max(0, w - 0.6)} height={barH} fill={signatureColorOf(s)} rx={1} />
                          {w > 34 && barH >= 10 && <text x={bx + x + w / 2} y={cy} dy="0.35em" textAnchor="middle" fontSize={11} fill="#fff" pointerEvents="none">{s}</text>}
                          <title>{`${c.label} · ${s}: ${n} mutations (${pct(n / Math.max(1, b.assigned))})`}</title>
                        </g>
                      );
                      x += w;
                      return rect;
                    })}
                </g>
              );
            })}
            {unit === "count" && xScale.ticks(5).map((v) => (
              <g key={v} transform={`translate(${LABEL_W + xScale(v)},0)`}>
                <line y1={0} y2={height} stroke={INK.grid} strokeDasharray="2 3" />
                <text y={height - 2} textAnchor="middle" fontSize={TYPE.micro} fill={INK.muted}>{v}</text>
              </g>
            ))}
          </svg>
        </div>
        {focus && focusStats && (
          <div style={{ marginTop: 10 }}>
            <Text strong>{t("components.single-cell.signatures.clade-vs-rest", { clade: clades.find((c) => c.key === focus)?.label || focus })}</Text>
            <div><Text type="secondary" style={{ fontSize: 13 }}>{t("components.single-cell.signatures.clade-vs-rest-meta2", { nClade: focusStats.nClade, nRest: focusStats.nRest })}</Text></div>
            <Table
              size="small"
              rowKey="signature"
              pagination={false}
              style={{ maxWidth: 760 }}
              dataSource={focusStats.rows}
              columns={[
                { title: t("components.single-cell.signatures.signature"), dataIndex: "signature", width: 90, render: (s) => <span><span className="sc-swatch" style={{ background: signatureColorOf(s) }} />{s}</span> },
                { title: t("components.single-cell.signatures.in-clade"), key: "in", width: 150, render: (_, r) => `${r.inClade} (${pct(r.inShare)})` },
                { title: t("components.single-cell.signatures.outside"), key: "out", width: 150, render: (_, r) => `${r.rest} (${pct(r.restShare)})` },
                { title: "OR", dataIndex: "oddsRatio", width: 80, render: (v) => (Number.isFinite(v) ? v.toFixed(2) : "∞") },
                { title: "Fisher p", dataIndex: "p", width: 100, render: (v, r) => <span style={{ color: v < 0.01 ? (r.inShare > r.restShare ? "#cf1322" : "#1d39c4") : undefined, fontWeight: v < 0.01 ? 600 : 400 }}>{v < 1e-4 ? "<1e-4" : v.toFixed(4)}</span> },
              ]}
            />
            <HintLine text={t("components.single-cell.signatures.clade-vs-rest-help2")} />
          </div>
        )}
        {allSigs.length > 0 && <AetiologyLegend rows={[{ activities: allSigs.map((s) => ({ signature: s })) }]} />}
        <HintLine text={t("components.single-cell.signatures.tree-help2")} />
      </div>
    </Card>
  );
}
