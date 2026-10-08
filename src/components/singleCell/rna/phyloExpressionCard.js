import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Card, Empty, Select, Space, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import PhylogenyCanvas from "../phylogenyCanvas";
import HeatmapCanvas from "../heatmapCanvas";
import StripLabels from "../stripLabels";
import ExpressionSidePanel from "../expressionSidePanel";
import useContainerWidth from "../useContainerWidth";
import usePixelRatio from "../usePixelRatio";
import useTreeView from "../useTreeView";
import useRnaData from "./useRnaData";
import { geneSetIndex, loadGmt, prettyTerm } from "./geneSets";
import singleCellActions from "../../../redux/singleCell/actions";
import Wrapper from "../index.style";
import {
  annotationColors,
  MISSING_RGBA,
  discreteColumnLookup,
  expressionRGBA,
  hexToRgb,
  packRGBA,
} from "../../../helpers/singleCell/matrix";
import { geneValues, topVariableGenes } from "../../../helpers/singleCell/staticRna";
import { stateScores } from "../../../helpers/singleCell/stateScores";
import { themePalette } from "../../../helpers/singleCell/themes";
import { clusteredGeneOrder, scaledExpression } from "../../../helpers/singleCell/rnaStats";

const { Text } = Typography;
const HEIGHT = 440;
const TREE_WIDTH = 170;

const GAP = 4;
const MAX_GENES = 2000;
const COUNTS = [20, 50, 100, 250, 500, 1000, 2000];


/**
 * Expression on the phylogeny: tree, clone and annotation strips (e.g. GBM
 * cell state) and a zoomable gene heatmap with rows aligned to the tree.
 * Genes come from the last DE comparison, the picked genes, the most variable
 * genes, or gene sets (3CA GBM state programs, Hallmark, Reactome, GO).
 * Hover and selection are shared with the UMAP and the Single-Cell tab.
 */
export default function PhyloExpressionCard({ summary, matrix }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((state) => state.SingleCell);
  const { geneList, deTop } = useSelector((state) => state.ScAnalysis);
  const { order, treeLayout, cellById } = useTreeView();
  const { rowOfId } = useRnaData();
  const [containerRef, width] = useContainerWidth(700);
  const pixelRatio = usePixelRatio();
  const [source, setSource] = useState("sets");
  const [nGenes, setNGenes] = useState(50);
  const [geneOrder, setGeneOrder] = useState("tree");
  const [collections, setCollections] = useState([]);
  const [collection, setCollection] = useState(null);
  const [sets, setSets] = useState([]);
  const [chosenSets, setChosenSets] = useState([]);
  // Default strips: GBM cell state and tumour region, when exported.
  const [annotations, setAnnotations] = useState(() =>
    ["state", "Region_Annotation"].filter((name) => summary.fields.some((f) => f.name === name))
  );
  const [hoverRange, setHoverRange] = useState(null);

  // GBM state (MES / AC / OPC / NPC) and proliferation scores as numeric cell
  // fields: they become strips here and colourings on the UMAP.
  const addStateScores = async () => {
    const entry = (await geneSetIndex()).find((c) => c.id === "gbm_3ca");
    const sets = entry ? new Map((await loadGmt(entry.file)).map((x) => [x.term, x.genes])) : new Map();
    const scores = stateScores(summary, matrix, sets);
    Object.entries(scores).forEach(([name, values]) => dispatch(singleCellActions.addRnaField(name, values, true)));
    setAnnotations((current) => [...new Set([...current, "score_MES", "score_AC", "score_OPC", "score_NPC", "score_cycling"])].filter((n) => scores[n] || current.includes(n)));
  };

  // Follow the newest source: a fresh DE result, or a new pick.
  useEffect(() => {
    if (deTop) setSource("de");
  }, [deTop]);
  const lastPicked = useRef(0);
  useEffect(() => {
    if (geneList.length && geneList.length !== lastPicked.current) setSource("picked");
    lastPicked.current = geneList.length;
  }, [geneList]);

  // Gene-set collections (3CA GBM programs first).
  useEffect(() => {
    geneSetIndex()
      .then((list) => {
        setCollections(list);
        setCollection((c) => c || list[0]?.id || null);
      })
      .catch(() => setCollections([]));
  }, []);
  useEffect(() => {
    const entry = collections.find((c) => c.id === collection);
    if (!entry) return;
    loadGmt(entry.file).then((list) => {
      setSets(list);
      // Default to the GBM state programs when they're there.
      const gbm = list.filter((s) => /MES_GLIOMA|ASTROCYTES|NPC_GLIOMA|OLIGO_PROGENITOR|NPC_OPC/.test(s.term)).map((s) => s.term);
      setChosenSets(gbm.length ? gbm : list.slice(0, 1).map((s) => s.term));
    });
  }, [collection, collections]);

  const variable = useMemo(() => (matrix ? topVariableGenes(summary, matrix, MAX_GENES) : []), [summary, matrix]);
  const listed = useMemo(() => {
    if (source === "picked") return geneList.slice(0, MAX_GENES);
    if (source === "de" && deTop) {
      // Half each way; a side with too few genes passing gives its share to the other.
      const n = Math.min(nGenes, MAX_GENES);
      const nUp = Math.min(deTop.up.length, Math.max(Math.ceil(n / 2), n - deTop.down.length));
      return [...deTop.up.slice(0, nUp), ...deTop.down.slice(0, n - nUp)];
    }
    if (source === "sets") {
      const bySet = new Map(sets.map((s) => [s.term, s.genes]));
      return [...new Set(chosenSets.flatMap((term) => bySet.get(term) || []))].filter((g) => summary.geneIndex.has(g));
    }
    return variable.slice(0, nGenes);
  }, [source, geneList, deTop, variable, nGenes, sets, chosenSets, summary]);

  // Order genes along the tree (row where expression is centred), or cluster
  // co-expressed genes together (PCA loadings on these genes).
  const genes = useMemo(() => {
    if (geneOrder === "listed" || !matrix || listed.length < 2) return listed;
    if (geneOrder === "clustered") {
      const idx = listed.map((g) => summary.geneIndex.get(g)).filter((g) => g != null);
      const X = scaledExpression(matrix, idx, summary.cells.length);
      return clusteredGeneOrder(X, summary.cells.length, idx.length).map((j) => summary.genes[idx[j]]);
    }
    const rnaRows = order.map((id) => rowOfId.get(id) ?? -1);
    const centre = new Map();
    listed.forEach((gene) => {
      const g = summary.geneIndex.get(gene);
      if (g == null) return;
      const v = geneValues(matrix, summary.cells.length, g);
      let w = 0;
      let s = 0;
      rnaRows.forEach((k, r) => {
        if (k < 0) return;
        w += v[k];
        s += v[k] * r;
      });
      centre.set(gene, w > 0 ? s / w : Infinity);
    });
    return [...listed].sort((a, b) => (centre.get(a) ?? Infinity) - (centre.get(b) ?? Infinity));
  }, [geneOrder, listed, matrix, order, rowOfId, summary]);

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

  /* ---- annotation strips: clone, then chosen metadata fields ---- */
  const annotationFields = useMemo(
    () => annotations.map((name) => summary.fields.find((f) => f.name === name)).filter(Boolean),
    [annotations, summary]
  );
  const levelColors = useMemo(
    () =>
      Object.fromEntries(
        annotationFields
          .filter((f) => !f.numeric)
          .map((f) => [f.name, annotationColors(f.levels, themePalette(layout.theme))])
      ),
    [annotationFields, layout.theme]
  );
  const ranges = useMemo(() => {
    const out = {};
    annotationFields
      .filter((f) => f.numeric)
      .forEach((f) => {
        const vals = summary.cells.map((c) => c[f.name]).filter(Number.isFinite);
        out[f.name] = [Math.min(...vals), Math.max(...vals)];
      });
    return out;
  }, [annotationFields, summary]);
  const STRIP = layout.stripWidth || 14; // shared with the CN heatmap's strip width
  const nStrips = 1 + annotationFields.length;
  const stripWidth = nStrips * STRIP;
  const stripCols = useMemo(() => discreteColumnLookup(nStrips, stripWidth * pixelRatio), [nStrips, stripWidth, pixelRatio]);
  const stripColor = useCallback(
    (r, c) => {
      const id = order[r];
      if (c === 0) {
        const clone = cellById.get(id)?.clone_id;
        return clone != null && cloneColors[clone] ? packRGBA(hexToRgb(cloneColors[clone])) : MISSING_RGBA;
      }
      const f = annotationFields[c - 1];
      const k = rowOfId.get(id);
      const v = k == null ? null : summary.cells[k][f.name];
      if (v == null || v === "") return MISSING_RGBA;
      if (f.numeric) {
        const [lo, hi] = ranges[f.name];
        return expressionRGBA(v - lo, hi - lo || 1);
      }
      const hex = levelColors[f.name]?.[`${v}`];
      return hex ? packRGBA(hexToRgb(hex)) : MISSING_RGBA;
    },
    [order, cellById, cloneColors, annotationFields, rowOfId, summary, ranges, levelColors]
  );

  const treeWidth = treeLayout ? TREE_WIDTH : 0;
  const heatWidth = Math.max(120, width - treeWidth - stripWidth - 2 * GAP);

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
    { value: "sets", label: t("components.single-cell.rna.src-sets") },
    {
      value: "de",
      label: deTop
        ? t("components.single-cell.rna.src-de", { a: deTop.labels.A, b: deTop.labels.B, count: deTop.up.length + deTop.down.length })
        : t("components.single-cell.rna.src-de-none"),
      disabled: !deTop,
    },
    { value: "picked", label: t("components.single-cell.rna.src-picked", { count: geneList.length }), disabled: !geneList.length },
    { value: "variable", label: t("components.single-cell.rna.src-variable") },
  ];

  return (
    <Wrapper>
      <Card
        size="small"
        title={
          <Space>
            <ApartmentOutlined />
            {t("components.single-cell.rna.phylo-title")}
            <Text type="secondary">{t("components.single-cell.rna.n-genes", { count: genes.length })}</Text>
          </Space>
        }
      >
        <Space wrap size={[12, 6]} style={{ marginBottom: 8 }}>
          <Select size="small" style={{ width: 210 }} value={source} onChange={setSource} options={sourceOptions} />
          {(source === "variable" || source === "de") && (
            <Select
              size="small"
              style={{ width: 110 }}
              value={nGenes}
              onChange={setNGenes}
              options={COUNTS.map((n) => ({ value: n, label: t("components.single-cell.rna.n-genes", { count: n }) }))}
            />
          )}
          {source === "sets" && (
            <>
              <Select
                size="small"
                style={{ width: 210 }}
                value={collection}
                onChange={setCollection}
                options={collections.map((c) => ({ value: c.id, label: c.title }))}
              />
              <Select
                size="small"
                mode="multiple"
                showSearch
                allowClear
                maxTagCount="responsive"
                style={{ minWidth: 260, maxWidth: 520 }}
                value={chosenSets}
                onChange={setChosenSets}
                options={sets.map((s) => ({ value: s.term, label: `${prettyTerm(s.term)} (${s.genes.length})` }))}
                filterOption={(input, option) => option.label.toUpperCase().includes(input.toUpperCase())}
              />
            </>
          )}
          <Select
            size="small"
            style={{ width: 140 }}
            value={geneOrder}
            onChange={setGeneOrder}
            options={[
              { value: "tree", label: t("components.single-cell.rna.order-tree") },
              { value: "clustered", label: t("components.single-cell.rna.order-clustered") },
              { value: "listed", label: t("components.single-cell.rna.order-listed") },
            ]}
          />
          <Select
            size="small"
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            style={{ minWidth: 180, maxWidth: 360 }}
            placeholder={t("components.single-cell.rna.annotations")}
            value={annotations}
            onChange={setAnnotations}
            options={summary.fields.map((f) => ({ value: f.name, label: f.name }))}
          />
          <Button size="small" disabled={!matrix} onClick={addStateScores}>
            {t("components.single-cell.rna.add-state-scores")}
          </Button>
        </Space>
        <div ref={containerRef}>
          {!genes.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.rna.no-genes")} />
          ) : (
            <>
            <StripLabels
              left={treeWidth ? treeWidth + GAP : 0}
              columnWidth={STRIP}
              labels={[t("components.single-cell.heatmap.strip-clone"), ...annotationFields.map((f) => f.name)]}
            />
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
                  hoverRange={hoverRange}
                  onSelectRange={([a, b], e) => {
                    const clade = order.slice(a, b + 1);
                    dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...selectedCellIds, ...clade] : clade));
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
              )}
              <HeatmapCanvas
                width={stripWidth}
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
            </>
          )}
          <Space wrap size={[12, 2]} style={{ marginTop: 4 }}>
            {annotationFields
              .filter((f) => !f.numeric)
              .map((f) => (
                <Space key={f.name} size={4} wrap>
                  <Text strong type="secondary">{f.name}</Text>
                  {Object.entries(levelColors[f.name] || {}).map(([level, color]) => (
                    <span key={level} className="sc-legend-item">
                      <span className="sc-legend-swatch" style={{ background: color }} />
                      <Text type="secondary">{level}</Text>
                    </span>
                  ))}
                </Space>
              ))}
          </Space>
          <div>
            <Text type="secondary" className="sc-hint">
              {t("components.single-cell.rna.phylo-hint")}
            </Text>
          </div>
        </div>
      </Card>
    </Wrapper>
  );
}
