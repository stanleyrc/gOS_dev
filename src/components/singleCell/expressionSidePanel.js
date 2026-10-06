import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Typography } from "antd";
import HeatmapCanvas from "./heatmapCanvas";
import useRnaData from "./rna/useRnaData";
import { discreteColumnLookup, expressionRGBA, packRGBA, hexToRgb } from "../../helpers/singleCell/matrix";
import { geneValues } from "../../helpers/singleCell/staticRna";

const { Text } = Typography;
const NO_RNA = packRGBA(hexToRgb("#FFFFFF"));
export const GENE_COLUMN_WIDTH = 18;
const LABEL_HEIGHT = 64;

/**
 * Expression of the genes picked on the RNA tab, one column per gene, rows
 * aligned to the tree. Each gene is scaled to its own maximum; cells without
 * RNA are blank. Reads the patient's static rna/ matrix.
 */
export default function ExpressionSidePanel({ genes, order, width, height, pixelRatio = 1, onRowClick, onHover, onLeave }) {
  const { t } = useTranslation("common");
  const { summary, matrix, rowOfId } = useRnaData();

  const columns = useMemo(() => {
    if (!summary || !matrix) return [];
    return genes
      .map((gene) => {
        const g = summary.geneIndex.get(gene) ?? summary.geneIndex.get(`${gene}`.toUpperCase());
        if (g == null) return null;
        const dense = geneValues(matrix, summary.cells.length, g);
        let max = 0;
        dense.forEach((v) => (max = Math.max(max, v)));
        return { gene: summary.genes[g], dense, max };
      })
      .filter(Boolean);
  }, [genes, summary, matrix]);

  const rows = useMemo(() => Int32Array.from(order, (id) => rowOfId.get(id) ?? -1), [order, rowOfId]);
  const cols = useMemo(() => discreteColumnLookup(columns.length, width * pixelRatio), [columns.length, width, pixelRatio]);
  const colorAt = useCallback(
    (r, c) => {
      const k = rows[r];
      if (k < 0) return NO_RNA;
      const col = columns[c];
      return expressionRGBA(col.dense[k], col.max || 1);
    },
    [rows, columns]
  );

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
        separators={columns.slice(1).map((_, k) => ((k + 1) * width) / columns.length)}
        onClick={onRowClick}
        onHover={({ row, col }, event) => {
          const c = columns[col];
          const k = rows[row];
          onHover(row, c ? [[c.gene, k < 0 ? t("components.single-cell.tooltip.no-rna") : c.dense[k].toFixed(2)]] : [], event);
        }}
        onLeave={onLeave}
      />
      <div className="sc-gene-labels" style={{ height: LABEL_HEIGHT }}>
        {columns.map((c, k) => (
          <span
            key={c.gene}
            className="sc-gene-label"
            style={{ left: ((k + 0.5) * width) / columns.length }}
            title={`${c.gene} (max ${c.max.toFixed(2)})`}
          >
            {c.gene}
          </span>
        ))}
      </div>
    </div>
  );
}
