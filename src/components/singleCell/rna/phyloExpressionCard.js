import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Card, Empty, Select, Space, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import PhylogenyCanvas from "../phylogenyCanvas";
import HeatmapCanvas from "../heatmapCanvas";
import ExpressionSidePanel from "../expressionSidePanel";
import useContainerWidth from "../useContainerWidth";
import usePixelRatio from "../usePixelRatio";
import useTreeView from "../useTreeView";
import singleCellActions from "../../../redux/singleCell/actions";
import Wrapper from "../index.style";
import { MISSING_RGBA, discreteColumnLookup, hexToRgb, packRGBA } from "../../../helpers/singleCell/matrix";
import { topVariableGenes } from "../../../helpers/singleCell/staticRna";

const { Text } = Typography;
const HEIGHT = 440;
const TREE_WIDTH = 170;
const STRIP = 12;
const GAP = 4;

/**
 * Expression on the phylogeny: the tree, a clone strip and a gene heatmap with
 * rows aligned to the tree. Genes come from the last DE comparison (top up and
 * down), the genes picked on this tab, or the most variable genes. Hover and
 * selection are shared with the UMAP and the Single-Cell tab.
 */
export default function PhyloExpressionCard({ summary, matrix }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cloneColors, selectedCellIds, hoveredCellId } = useSelector((state) => state.SingleCell);
  const { geneList, deTop } = useSelector((state) => state.ScAnalysis);
  const { order, treeLayout, cellById } = useTreeView();
  const [containerRef, width] = useContainerWidth(700);
  const pixelRatio = usePixelRatio();
  const [source, setSource] = useState("variable");
  const [nGenes, setNGenes] = useState(20);

  // Follow the newest source: a fresh DE result, or a new pick.
  useEffect(() => {
    if (deTop) setSource("de");
  }, [deTop]);
  const lastPicked = useRef(0);
  useEffect(() => {
    if (geneList.length && geneList.length !== lastPicked.current) setSource("picked");
    lastPicked.current = geneList.length;
  }, [geneList]);

  const variable = useMemo(() => (matrix ? topVariableGenes(summary, matrix, 50) : []), [summary, matrix]);
  const genes = useMemo(() => {
    if (source === "picked") return geneList.slice(0, 60);
    if (source === "de" && deTop) {
      const half = Math.ceil(nGenes / 2);
      return [...deTop.up.slice(0, half), ...deTop.down.slice(0, half)];
    }
    return variable.slice(0, nGenes);
  }, [source, geneList, deTop, variable, nGenes]);

  const nRows = order.length;
  const rowOf = useMemo(() => new Map(order.map((id, k) => [id, k])), [order]);
  const selectedRows = useMemo(
    () => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)),
    [selectedCellIds, rowOf]
  );
  const hoverRow = hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null;
  const leafClones = useMemo(
    () => (treeLayout ? treeLayout.leaves.map((id) => cellById.get(id)?.clone_id ?? null) : []),
    [treeLayout, cellById]
  );
  const treeWidth = treeLayout ? TREE_WIDTH : 0;
  const heatWidth = Math.max(120, width - treeWidth - STRIP - 2 * GAP);

  const stripCols = useMemo(() => discreteColumnLookup(1, STRIP * pixelRatio), [pixelRatio]);
  const stripColor = useCallback(
    (r) => {
      const clone = cellById.get(order[r])?.clone_id;
      return clone != null && cloneColors[clone] ? packRGBA(hexToRgb(cloneColors[clone])) : MISSING_RGBA;
    },
    [cellById, order, cloneColors]
  );

  const hoverRef = useRef(null);
  const share = (id) => {
    if (hoverRef.current === id) return;
    hoverRef.current = id;
    dispatch(singleCellActions.updateHover(id));
  };
  const onRowClick = ({ row }, event) => {
    const id = order[row];
    if (event.metaKey || event.ctrlKey) {
      dispatch(
        singleCellActions.updateSelection(
          selectedCellIds.includes(id) ? selectedCellIds.filter((c) => c !== id) : [...selectedCellIds, id]
        )
      );
    } else {
      dispatch(singleCellActions.updateSelection([id]));
    }
  };

  const sourceOptions = [
    { value: "de", label: deTop ? t("components.single-cell.rna.src-de", { a: deTop.labels.A }) : t("components.single-cell.rna.src-de-none"), disabled: !deTop },
    { value: "picked", label: t("components.single-cell.rna.src-picked", { count: geneList.length }), disabled: !geneList.length },
    { value: "variable", label: t("components.single-cell.rna.src-variable") },
  ];

  return (
    <Wrapper>
    <Card
      size="small"
      title={<Space><ApartmentOutlined />{t("components.single-cell.rna.phylo-title")}</Space>}
      extra={
        <Space wrap>
          <Select size="small" style={{ width: 230 }} value={source} onChange={setSource} options={sourceOptions} />
          {source !== "picked" && (
            <Select
              size="small"
              style={{ width: 90 }}
              value={nGenes}
              onChange={setNGenes}
              options={[10, 20, 30, 50].map((n) => ({ value: n, label: t("components.single-cell.rna.n-genes", { count: n }) }))}
            />
          )}
        </Space>
      }
    >
      <div ref={containerRef}>
        {!genes.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.rna.no-genes")} />
        ) : (
          <div style={{ display: "flex", gap: GAP, alignItems: "flex-start" }} onMouseLeave={() => share(null)}>
            {treeLayout && (
              <PhylogenyCanvas
                layout={treeLayout}
                nRows={nRows}
                width={treeWidth}
                height={HEIGHT}
                pixelRatio={pixelRatio}
                leafClones={leafClones}
                cloneColors={cloneColors}
                selectedRows={selectedRows}
                hoverRow={hoverRow}
                onSelectRange={([a, b], e) => {
                  const clade = order.slice(a, b + 1);
                  dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...selectedCellIds, ...clade] : clade));
                }}
                onHoverNode={(node) => share(node ? order[node.firstLeaf] : null)}
              />
            )}
            <HeatmapCanvas
              width={STRIP}
              height={HEIGHT}
              nRows={nRows}
              cols={stripCols}
              colorAt={stripColor}
              pixelRatio={pixelRatio}
              onClick={onRowClick}
              onHover={({ row }) => share(order[row])}
            />
            <ExpressionSidePanel
              genes={genes}
              order={order}
              width={heatWidth}
              height={HEIGHT}
              pixelRatio={pixelRatio}
              onRowClick={onRowClick}
              onHover={(row) => share(row != null && row >= 0 ? order[row] : null)}
              onLeave={() => share(null)}
            />
          </div>
        )}
        <Text type="secondary" className="sc-hint">
          {t("components.single-cell.rna.phylo-hint")}
        </Text>
      </div>
    </Card>
    </Wrapper>
  );
}
