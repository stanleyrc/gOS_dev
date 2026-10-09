import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Checkbox, Empty, Space } from "antd";
import { NodeIndexOutlined } from "@ant-design/icons";
import { walkContainment } from "../../../helpers/singleCell/walks";
import { attachRare, containmentTree, splitRare, subMatrix } from "../../../helpers/singleCell/walkPanels";
import HintLine from "../hintLine";
import { useRareMax } from "./rareControl";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const fmtBp = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} Mb` : `${(v / 1e3).toFixed(0)} kb`);
const ROW = 19;
const INDENT = 14;
const CELL = 19;
const MUTED = INK.muted;

/**
 * How the selected walks nest. Left: the containment hierarchy (each walk
 * under the shortest walk holding >= 90 % of it), with length and
 * carriers; rare walks (shared threshold) collapse into a "+n rare" row
 * under the walk they overlap. Right, on the same rows: a compact matrix of
 * the fraction of the row walk inside the column walk (empty = 0).
 */
export default function WalkContainmentCard({ walks, colorOf, cellIds = [], onFocus, focus }) {
  const { t } = useTranslation("common");
  const rareMax = useRareMax();
  const [showRare, setShowRare] = useState(false);
  const { matrix, lengths } = useMemo(() => walkContainment(walks), [walks]);
  const index = useMemo(() => new Map(walks.map((w, i) => [w.id, i])), [walks]);
  const { common, rare, carriers } = useMemo(() => splitRare(walks, cellIds, rareMax), [walks, cellIds, rareMax]);
  const folding = !showRare && common.length >= 2 && rare.length > 0;

  const display = useMemo(() => {
    const visible = (folding ? common : walks).map((w) => index.get(w.id));
    const hidden = folding ? rare.map((w) => index.get(w.id)) : [];
    const tree = containmentTree(subMatrix(matrix, visible), visible.map((i) => lengths[i]));
    const attached = attachRare(matrix, hidden, visible);
    const rows = [];
    tree.forEach((r) => {
      const i = visible[r.index];
      rows.push({ kind: "walk", i, depth: r.depth, share: r.share, parent: r.parent >= 0 ? visible[r.parent] : -1 });
      const extra = attached.get(i);
      if (extra?.length) rows.push({ kind: "rare", members: extra, depth: r.depth + 1, host: i });
    });
    const loose = attached.get(-1);
    if (loose?.length) rows.push({ kind: "rare", members: loose, depth: 0, host: -1 });
    return { rows, cols: rows.filter((r) => r.kind === "walk").map((r) => r.i) };
  }, [walks, common, rare, matrix, lengths, index, folding]);

  if (walks.length < 2) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.contain-few")} />;

  const { rows, cols } = display;
  const maxDepth = d3.max(rows, (r) => r.depth) || 0;
  const TREE_W = 330 + maxDepth * INDENT;
  const TOP = 16;
  const matX = TREE_W + 8;
  const num = new Map(cols.map((i, c) => [i, c + 1]));
  const rowOf = new Map(rows.map((r, k) => [r.kind === "walk" ? r.i : `rare-${r.host}`, k]));
  const color = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);
  const h = TOP + rows.length * ROW + 2;
  const w = matX + cols.length * CELL + 8;
  return (
    <Card
      size="small"
      title={<Space size={6}><NodeIndexOutlined />{t("components.single-cell.ecdna.contain-title")}<HintLine inline provenance="walkNesting" text={t("components.single-cell.ecdna.contain-help")} /></Space>}
      extra={rare.length > 0 && common.length >= 2 && <Checkbox checked={showRare} onChange={(e) => setShowRare(e.target.checked)}>{t("components.single-cell.ecdna.contain-show-rare", { count: rare.length })}</Checkbox>}
    >
      <div style={{ overflowX: "auto" }}>
        <svg width={w} height={h} style={{ display: "block" }}>
          {/* column numbers match the row badges */}
          {cols.map((i, c) => (
            <text key={`c${i}`} x={matX + (c + 0.5) * CELL} y={TOP - 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={colorOf(walks[i].id)}>
              {c + 1}
              <title>{walks[i].label}</title>
            </text>
          ))}
          {rows.map((r, k) => {
            const y = TOP + k * ROW;
            const cy = y + ROW / 2;
            const x0 = 4 + r.depth * INDENT;
            // elbow from the parent's row (walk parent, or the host of a "+n rare" row)
            const pk = rowOf.get(r.kind === "walk" ? r.parent : r.host);
            const fromY = pk != null && pk < k ? TOP + pk * ROW + ROW / 2 + 5 : y;
            const connector = r.depth > 0 && <path d={`M${x0 - INDENT + 6},${fromY} V${cy} H${x0 - 1}`} fill="none" stroke={MUTED} strokeOpacity={0.7} />;
            if (r.kind === "rare") {
              const names = r.members.map((m) => walks[m].label);
              return (
                <g key={`rare-${r.host}`}>
                  {connector}
                  <text x={x0 + 2} y={cy} dy="0.35em" fontSize={TYPE.tick} fontStyle="italic" fill={MUTED}>
                    {`+${r.members.length} rare (≤ ${rareMax} cells): ${names.slice(0, 3).join(", ")}${names.length > 3 ? ", …" : ""}`}
                    <title>{r.members.map((m) => `${walks[m].label} · ${carriers.get(walks[m].id) || 0} cells · ${fmtBp(lengths[m])}`).join("\n")}</title>
                  </text>
                </g>
              );
            }
            const wk = walks[r.i];
            const isRare = (carriers.get(wk.id) || 0) <= rareMax;
            const isFocus = focus === wk.id;
            return (
              <g key={wk.id} style={{ cursor: onFocus ? "pointer" : "default" }} onClick={() => onFocus && onFocus(wk.id)}>
                <rect x={0} y={y} width={w} height={ROW} fill={isFocus ? INK.selectFill : k % 2 ? "rgba(128,128,128,0.06)" : "transparent"} />
                {connector}
                <text x={x0} y={cy} dy="0.35em" fontSize={TYPE.micro} fill={MUTED}>{num.get(r.i)}</text>
                <circle cx={x0 + 17} cy={cy} r={4.5} fill={colorOf(wk.id)} />
                <text x={x0 + 26} y={cy} dy="0.35em" fontSize={TYPE.label} fill="currentColor" fontWeight={isRare ? 400 : 600} fontStyle={isRare ? "italic" : "normal"}>
                  {wk.label.length > 20 ? `${wk.label.slice(0, 19)}…` : wk.label}
                  <tspan fill={MUTED} fontWeight={400} fontStyle="normal" fontSize={11}>{`  ${fmtBp(lengths[r.i])} · ${carriers.get(wk.id) || 0} cells`}</tspan>
                  <title>{`${wk.label}${r.parent >= 0 ? `\n${d3.format(".0%")(r.share)} inside ${walks[r.parent].label}` : ""}`}</title>
                </text>
                {r.parent >= 0 && <text x={TREE_W - 2} y={cy} dy="0.35em" textAnchor="end" fontSize={11} fill={MUTED}>{`⊂ ${num.get(r.parent)} · ${d3.format(".0%")(r.share)}`}</text>}
                {cols.map((j, c) => {
                  const v = matrix[r.i][j];
                  const x = matX + c * CELL;
                  if (r.i === j) return <rect key={j} x={x + 4} y={y + 4} width={CELL - 8} height={ROW - 8} fill={colorOf(wk.id)} fillOpacity={0.45} rx={2} />;
                  return (
                    <g key={j}>
                      <rect x={x + 0.5} y={y + 0.5} width={CELL - 1} height={ROW - 1} fill={v >= 0.01 ? color(0.15 + 0.85 * v) : "transparent"} stroke={MUTED} strokeOpacity={0.2} />
                      <title>{t("components.single-cell.ecdna.contain-cell", { a: wk.label, b: walks[j].label, pct: d3.format(".0%")(v) })}</title>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTED, marginTop: 2, marginLeft: matX }}>
        <span>0</span>
        <span style={{ width: 80, height: 8, borderRadius: 2, background: `linear-gradient(to right, ${color(0.15)}, ${color(1)})` }} />
        <span>{t("components.single-cell.ecdna.contain-scale")}</span>
      </div>
    </Card>
  );
}
