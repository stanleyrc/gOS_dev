import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Space, Tooltip, Typography } from "antd";
import { AiOutlineFullscreen, AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import HeatmapCanvas from "./heatmapCanvas";
import useRnaData from "./rna/useRnaData";
import { discreteColumnLookup, expressionRGBA, hexToRgb, packRGBA, wheelZoomFactor } from "../../helpers/singleCell/matrix";
import { geneValues } from "../../helpers/singleCell/staticRna";

const { Text } = Typography;
const NO_RNA = packRGBA(hexToRgb("#FFFFFF"));
export const GENE_COLUMN_WIDTH = 18;
const LABEL_HEIGHT = 64;
const MIN_LABEL_PX = 9;

/**
 * Expression of `genes`, one column per gene, rows aligned to the tree. Each
 * gene is scaled to its own maximum; cells without RNA are blank. Reads the
 * patient's static rna/ matrix. With many genes, wheel (as the genome plots),
 * drag and double-click zoom the columns; names show once columns are wide
 * enough to read.
 */
export default function ExpressionSidePanel({ genes, order, width, height, pixelRatio = 1, onRowClick, onHover, onLeave }) {
  const { t } = useTranslation("common");
  const { summary, matrix, rowOfId } = useRnaData();
  const zoomedByCmd = useSelector((state) => state.Settings.zoomedByCmd);

  const columns = useMemo(() => {
    if (!summary || !matrix) return [];
    const seen = new Set();
    return genes
      .map((gene) => {
        const g = summary.geneIndex.get(gene) ?? summary.geneIndex.get(`${gene}`.toUpperCase());
        if (g == null || seen.has(g)) return null;
        seen.add(g);
        const dense = geneValues(matrix, summary.cells.length, g);
        let max = 0;
        dense.forEach((v) => (max = Math.max(max, v)));
        return { gene: summary.genes[g], dense, max };
      })
      .filter(Boolean);
  }, [genes, summary, matrix]);

  /* ---- column zoom ---- */
  const n = columns.length;
  const [range, setRange] = useState(null);
  useEffect(() => setRange(null), [n, genes]);
  const rangeRef = useRef(null);
  rangeRef.current = range || [0, n];
  const setSpan = (start, span) => {
    const size = Math.max(Math.min(3, n), Math.min(n, Math.round(span)));
    const s = Math.max(0, Math.min(n - size, Math.round(start)));
    setRange(s === 0 && size === n ? null : [s, s + size]);
  };
  const zoomAt = (fraction, factor) => {
    const [s, e] = rangeRef.current;
    const span = e - s;
    const next = span * factor;
    setSpan(s + fraction * span - fraction * next, next);
  };
  const [s0, e0] = range || [0, n];
  const visible = e0 - s0;

  const rows = useMemo(() => Int32Array.from(order, (id) => rowOfId.get(id) ?? -1), [order, rowOfId]);
  const cols = useMemo(() => {
    const disc = discreteColumnLookup(visible, width * pixelRatio);
    return Int32Array.from(disc, (k) => (k < 0 ? -1 : s0 + k));
  }, [visible, s0, width, pixelRatio]);
  const colorAt = useCallback(
    (r, c) => {
      const k = rows[r];
      if (k < 0) return NO_RNA;
      const col = columns[c];
      return expressionRGBA(col.dense[k], col.max || 1);
    },
    [rows, columns]
  );
  const colPx = width / Math.max(1, visible);
  const showLabels = colPx >= MIN_LABEL_PX;

  if (!summary) return null;
  if (!matrix) {
    return (
      <div style={{ width, height }} className="sc-heatmap-empty">
        <Text type="secondary">{t("components.single-cell.rna.loading-matrix")}</Text>
      </div>
    );
  }
  return (
    <div style={{ width }}>
      <HeatmapCanvas
        width={width}
        height={height}
        nRows={order.length}
        cols={cols}
        colorAt={colorAt}
        pixelRatio={pixelRatio}
        separators={showLabels ? Array.from({ length: visible - 1 }, (_, k) => (k + 1) * colPx) : []}
        onClick={onRowClick}
        onDrag={n > 3 ? ({ dx }) => {
          const [s, e] = rangeRef.current;
          setSpan(s - (dx * (e - s)) / width, e - s);
        } : undefined}
        onWheelZoom={n > 3 ? (e) => zoomAt(e.x / width, wheelZoomFactor(e)) : undefined}
        wheelNeedsModifier={Boolean(zoomedByCmd)}
        onDoubleClick={n > 3 ? ({ x }) => zoomAt(x / width, 0.5) : undefined}
        onHover={({ row, col }, event) => {
          const c = columns[col];
          const k = rows[row];
          onHover(row, c ? [[c.gene, k < 0 ? t("components.single-cell.tooltip.no-rna") : c.dense[k].toFixed(2)]] : [], event);
        }}
        onLeave={onLeave}
      />
      {showLabels ? (
        <div className="sc-gene-labels" style={{ height: LABEL_HEIGHT }}>
          {columns.slice(s0, e0).map((c, k) => (
            <span key={c.gene} className="sc-gene-label" style={{ left: (k + 0.5) * colPx }} title={`${c.gene} (max ${c.max.toFixed(2)})`}>
              {c.gene}
            </span>
          ))}
        </div>
      ) : (
        <div className="sc-side-axis">
          <Text type="secondary" className="sc-hint">
            {t("components.single-cell.rna.genes-range", { from: s0 + 1, to: e0, total: n })}
          </Text>
        </div>
      )}
      {n > 3 && (
        <Space size={2} className="sc-gene-zoom">
          <Tooltip title={t("components.single-cell.heatmap.zoom-in")}>
            <Button size="small" type="text" icon={<AiOutlineZoomIn />} onClick={() => zoomAt(0.5, 0.5)} />
          </Tooltip>
          <Tooltip title={t("components.single-cell.heatmap.zoom-out")}>
            <Button size="small" type="text" icon={<AiOutlineZoomOut />} onClick={() => zoomAt(0.5, 2)} />
          </Tooltip>
          <Tooltip title={t("components.single-cell.side.reset")}>
            <Button size="small" type="text" icon={<AiOutlineFullscreen />} onClick={() => setRange(null)} />
          </Tooltip>
        </Space>
      )}
    </div>
  );
}
