import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Segmented, Select, Space, Tooltip, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import { AiOutlineDownload, AiOutlineFullscreen, AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import HeatmapCanvas from "./heatmapCanvas";
import PhylogenyCanvas from "./phylogenyCanvas";
import HeatmapLegend from "./heatmapLegend";
import useContainerWidth from "./useContainerWidth";
import singleCellActions from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import {
  MISSING_RGBA,
  binLabel,
  chromosomeSpans,
  cnStateRGBA,
  discreteColumnLookup,
  discreteGroups,
  domainExtents,
  genomicColumnLookup,
  hexToRgb,
  junctionColumnOrder,
  junctionRGBA,
  packRGBA,
  panDomain,
  rowMap,
  snvColumnOrder,
  snvStatusRGBA,
  zoomDomain,
} from "../../helpers/singleCell/matrix";
import Wrapper from "./index.style";

const { Text } = Typography;
const TREE_WIDTH = 180;
const ANNOTATION_WIDTH = 18;
const GAP = 4;
const AXIS_HEIGHT = 18;
const SELECTED_RGBA = packRGBA(hexToRgb("#262626"));
const UNSELECTED_RGBA = packRGBA(hexToRgb("#FFFFFF"));

const heatmapHeight = (nRows) => Math.min(720, Math.max(160, nRows * 6));
const isMulti = (event) => event.metaKey || event.ctrlKey;

/**
 * Phylogeny + cells x genome heatmap for a single-cell patient. Rows follow
 * the tree; the heatmap shows total copy number (each cell's genome graph
 * nodes), SNVs (each cell's mutations) or junction copy number.
 *
 * Click a leaf or row to pull up that cell; Cmd/Ctrl-click adds or removes
 * cells; Shift-click selects a range; click an internal node for its clade.
 */
export default function CellHeatmapPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const sc = useSelector((state) => state.SingleCell);
  const { domains, chromoBins, defaultDomain, genomeLength } = useSelector((state) => state.Settings);
  const [containerRef, containerWidth] = useContainerWidth();
  const [hover, setHover] = useState(null);
  const anchorRow = useRef(null);
  const canvasHolder = useRef(null);

  const { order, cells, cloneColors, tree, cn, snv, junctions, heatmapType, snvOrder, selectedCellIds } = sc;
  const nRows = order.length;
  const hasTree = tree.status === "ok" && Boolean(tree.data?.layout);
  const treeWidth = hasTree ? TREE_WIDTH : 0;
  const heatWidth = Math.max(
    200,
    containerWidth - treeWidth - ANNOTATION_WIDTH - (hasTree ? GAP : 0) - GAP
  );
  const height = heatmapHeight(nRows);

  /* ---- zoom / pan: same shared domains as the genome view and the cell tracks ---- */
  const pendingDomains = useRef(null);
  const frame = useRef(null);
  useEffect(() => {
    pendingDomains.current = null;
  }, [domains]);
  useEffect(() => () => frame.current && cancelAnimationFrame(frame.current), []);
  const bounds = useMemo(() => [1, genomeLength || defaultDomain?.[1] || 1], [genomeLength, defaultDomain]);
  const pushDomains = (next) => {
    pendingDomains.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pendingDomains.current) dispatch(settingsActions.updateDomains(pendingDomains.current));
    });
  };
  const currentDomains = () => pendingDomains.current || domains;
  const extentAt = (x) => {
    const extents = domainExtents(currentDomains(), heatWidth, GAP);
    const k = extents.findIndex(([px0, px1]) => x >= px0 && x < px1);
    return k < 0 ? null : { k, extent: extents[k] };
  };
  const handlePan = ({ dx, startX }) => {
    const hit = extentAt(startX);
    if (!hit) return;
    const [px0, px1, d] = hit.extent;
    const next = [...currentDomains()];
    next[hit.k] = panDomain(d, (-dx * (d[1] - d[0])) / (px1 - px0), bounds);
    pushDomains(next);
  };
  const handleWheelZoom = ({ x, deltaY }) => {
    const hit = extentAt(x);
    if (!hit) return;
    const [px0, px1, d] = hit.extent;
    const anchor = d[0] + ((x - px0) / (px1 - px0)) * (d[1] - d[0]);
    const next = [...currentDomains()];
    next[hit.k] = zoomDomain(d, anchor, deltaY > 0 ? 1.25 : 0.8, bounds);
    pushDomains(next);
  };
  const zoomAll = (factor) =>
    pushDomains(currentDomains().map((d) => zoomDomain(d, (d[0] + d[1]) / 2, factor, bounds)));

  const cellById = useMemo(() => new Map(cells.map((c) => [c.cell_id, c])), [cells]);
  const rowOf = useMemo(() => new Map(order.map((id, k) => [id, k])), [order]);
  const selectedRows = useMemo(
    () => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)),
    [selectedCellIds, rowOf]
  );
  const leafClones = useMemo(
    () => (hasTree ? tree.data.layout.leaves.map((id) => cellById.get(id)?.clone_id ?? null) : []),
    [hasTree, tree, cellById]
  );
  const selectedLeafRange = useMemo(() => {
    if (!hasTree || !selectedRows.size) return null;
    const rows = [...selectedRows];
    const lo = Math.min(...rows);
    const hi = Math.max(...rows);
    // Only shade when the selection is one contiguous block of tree rows.
    return hi - lo + 1 === rows.length && hi < tree.data.layout.leaves.length ? [lo, hi] : null;
  }, [hasTree, selectedRows, tree]);

  /* ---- active matrix: column lookup, colour function, axis ---- */
  const active = useMemo(() => {
    if (heatmapType === "cn" && cn.status === "ok") {
      const { rows } = cn.data;
      const map = rowMap(order, cn.data.cells);
      const lookups = new Map();
      const colsFor = (r) => {
        const p = map[r];
        if (p < 0 || !rows[p]) return null;
        if (!lookups.has(p)) {
          lookups.set(p, genomicColumnLookup(rows[p].binIndex, domains, heatWidth, GAP).cols);
        }
        return lookups.get(p);
      };
      const axis = chromosomeSpans(chromoBins, domainExtents(domains, heatWidth, GAP));
      return {
        cols: colsFor,
        axis,
        colorAt: (r, c) => cnStateRGBA(rows[map[r]].values[c]),
        describe: (r, c) => {
          const p = map[r];
          if (p < 0 || !rows[p]) return [[t("components.single-cell.tooltip.state"), t("components.single-cell.no-file")]];
          if (c < 0) return null;
          return [
            [t("components.single-cell.tooltip.segment"), binLabel(rows[p].binIndex, c)],
            [t("components.single-cell.tooltip.state"), rows[p].values[c]],
          ];
        },
      };
    }
    if (heatmapType === "snv" && snv.status === "ok") {
      const m = snv.data;
      const map = rowMap(order, m.cells);
      const columnOrder = snvColumnOrder(m, snvOrder);
      const disc = discreteColumnLookup(columnOrder.length, heatWidth);
      const cols = Int32Array.from(disc, (k) => (k < 0 ? -1 : columnOrder[k]));
      const axis =
        snvOrder === "genomic"
          ? discreteGroups(columnOrder, (i) => m.variants[i].chromosome, heatWidth)
          : { spans: [], separators: [] };
      const statusText = {
        1: t("components.single-cell.snv.present"),
        0: t("components.single-cell.snv.absent"),
        [-1]: t("components.single-cell.snv.missing"),
      };
      return {
        cols,
        axis,
        colorAt: (r, c) => {
          const p = map[r];
          return p < 0 ? snvStatusRGBA(-1) : snvStatusRGBA(m.status[p][c]);
        },
        describe: (r, c) => {
          const p = map[r];
          if (p < 0 || c < 0) return null;
          const v = m.variants[c];
          const alt = m.alt[p][c];
          const depth = m.depth[p][c];
          return [
            [t("components.single-cell.tooltip.variant"), v.id],
            ...(v.gene ? [[t("components.single-cell.tooltip.gene"), v.gene]] : []),
            ...(v.annotation ? [[t("components.single-cell.tooltip.annotation"), v.annotation]] : []),
            [t("components.single-cell.tooltip.status"), statusText[m.status[p][c]]],
            ...(Number.isFinite(alt)
              ? [[t("components.single-cell.tooltip.reads"), `${alt} / ${Number.isFinite(depth) ? depth : "NA"}`]]
              : []),
          ];
        },
      };
    }
    if (heatmapType === "junctions" && junctions.status === "ok") {
      const m = junctions.data;
      const map = rowMap(order, m.cells);
      const columnOrder = junctionColumnOrder(m.junctions);
      const disc = discreteColumnLookup(columnOrder.length, heatWidth);
      const cols = Int32Array.from(disc, (k) => (k < 0 ? -1 : columnOrder[k]));
      const axis = discreteGroups(columnOrder, (i) => m.junctions[i].chromosome1, heatWidth);
      return {
        cols,
        axis,
        colorAt: (r, c) => {
          const p = map[r];
          return p < 0 ? MISSING_RGBA : junctionRGBA(m.cn[p][c], m.maxCn);
        },
        describe: (r, c) => {
          const p = map[r];
          if (p < 0 || c < 0) return null;
          const j = m.junctions[c];
          const value = m.cn[p][c];
          return [
            [
              t("components.single-cell.tooltip.breakpoints"),
              `${j.chromosome1}:${j.position1.toLocaleString()}${j.strand1} → ${j.chromosome2}:${j.position2.toLocaleString()}${j.strand2}`,
            ],
            ...(j.class ? [[t("components.single-cell.tooltip.type"), j.class]] : []),
            [t("components.single-cell.tooltip.junction-cn"), Number.isFinite(value) ? value : t("components.single-cell.no-file")],
          ];
        },
      };
    }
    return null;
  }, [heatmapType, cn, snv, junctions, order, domains, heatWidth, chromoBins, snvOrder, t]);

  const annotationCols = useMemo(() => discreteColumnLookup(2, ANNOTATION_WIDTH), []);
  const annotationColor = useCallback(
    (r, c) => {
      if (c === 0) return selectedRows.has(r) ? SELECTED_RGBA : UNSELECTED_RGBA;
      const clone = cellById.get(order[r])?.clone_id;
      return clone != null && cloneColors[clone] ? packRGBA(hexToRgb(cloneColors[clone])) : MISSING_RGBA;
    },
    [selectedRows, cellById, order, cloneColors]
  );

  /* ---- selection ---- */
  const setSelection = (ids) => dispatch(singleCellActions.updateSelection(ids));

  const handleRowClick = ({ row }, event) => {
    const id = order[row];
    if (event.shiftKey && anchorRow.current != null) {
      const [a, b] = [anchorRow.current, row].sort((x, y) => x - y);
      setSelection([...selectedCellIds, ...order.slice(a, b + 1)]);
    } else if (isMulti(event)) {
      setSelection(
        selectedCellIds.includes(id)
          ? selectedCellIds.filter((c) => c !== id)
          : [...selectedCellIds, id]
      );
    } else {
      setSelection([id]);
    }
    anchorRow.current = row;
  };

  const handleTreeSelect = ([a, b], event) => {
    if (a === b) {
      handleRowClick({ row: a }, event);
      return;
    }
    const clade = order.slice(a, b + 1);
    setSelection(isMulti(event) || event.shiftKey ? [...selectedCellIds, ...clade] : clade);
  };

  const hoverCell = (row, extra, event) => {
    if (row == null || row < 0) return setHover(null);
    const cell = cellById.get(order[row]);
    const holder = canvasHolder.current?.getBoundingClientRect();
    const left = event.clientX - (holder?.left || 0) + 14;
    setHover({
      left: Math.min(left, (holder?.width || left) - 240),
      top: event.clientY - (holder?.top || 0) + 14,
      lines: [
        [t("components.single-cell.tooltip.cell"), order[row]],
        ...(cell?.clone_id != null ? [[t("components.single-cell.tooltip.clone"), cell.clone_id]] : []),
        ...(extra || []),
      ],
    });
  };

  const downloadPng = () => {
    const holder = canvasHolder.current;
    if (!holder) return;
    const out = document.createElement("canvas");
    out.width = holder.clientWidth;
    out.height = height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    const base = holder.getBoundingClientRect();
    holder.querySelectorAll("canvas").forEach((c) => {
      const r = c.getBoundingClientRect();
      ctx.drawImage(c, r.left - base.left, r.top - base.top);
    });
    const link = document.createElement("a");
    link.download = `${sc.patient?.caseReportId || "patient"}_${heatmapType}_heatmap.png`;
    link.href = out.toDataURL("image/png");
    link.click();
  };

  const typeOptions = [
    { value: "cn", label: t("components.single-cell.heatmap.cn"), disabled: cn.status !== "ok" },
    { value: "snv", label: t("components.single-cell.heatmap.snv"), disabled: snv.status !== "ok" },
    {
      value: "junctions",
      label: t("components.single-cell.heatmap.junctions"),
      disabled: junctions.status !== "ok",
    },
  ];

  const alerts = [];
  if (tree.error) {
    alerts.push({ key: "tree", message: t("components.single-cell.errors.tree"), description: tree.error.message });
  }
  [["cn", cn], ["snv", snv], ["junctions", junctions]].forEach(([key, s]) => {
    if (s.status === "error") {
      alerts.push({ key, message: t(`components.single-cell.errors.${key}`), description: s.error?.message });
    }
  });
  const missingGenomes = cn.status === "ok" ? cn.data.rows.filter((r) => !r).length : 0;

  const treeNote =
    tree.status === "ok"
      ? t(`components.single-cell.tree.${tree.method}`)
      : t("components.single-cell.tree.none");

  return (
    <Wrapper>
      <Card
        size="small"
        title={
          <Space wrap>
            <ApartmentOutlined />
            <span>{t("components.single-cell.heatmap.title")}</span>
            <Text type="secondary">
              {t("components.single-cell.heatmap.cell-count", { count: nRows })}
            </Text>
            <Text type="secondary" className="sc-hint">
              · {treeNote}
            </Text>
          </Space>
        }
        extra={
          <Space wrap>
            <Segmented
              size="small"
              options={typeOptions}
              value={heatmapType}
              onChange={(value) => dispatch(singleCellActions.updateHeatmapType(value))}
            />
            {heatmapType === "snv" && (
              <Select
                size="small"
                value={snvOrder}
                style={{ width: 150 }}
                onChange={(value) => dispatch(singleCellActions.updateSnvOrder(value))}
                options={[
                  { value: "genomic", label: t("components.single-cell.snv.order-genomic") },
                  { value: "prevalence", label: t("components.single-cell.snv.order-prevalence") },
                ]}
              />
            )}
            {heatmapType === "cn" && (
              <Tooltip title={t("components.single-cell.heatmap.zoom-in")}>
                <Button size="small" icon={<AiOutlineZoomIn />} onClick={() => zoomAll(0.5)} />
              </Tooltip>
            )}
            {heatmapType === "cn" && (
              <Tooltip title={t("components.single-cell.heatmap.zoom-out")}>
                <Button size="small" icon={<AiOutlineZoomOut />} onClick={() => zoomAll(2)} />
              </Tooltip>
            )}
            {heatmapType === "cn" && (
              <Tooltip title={t("components.single-cell.heatmap.whole-genome")}>
                <Button
                  size="small"
                  icon={<AiOutlineFullscreen />}
                  onClick={() => defaultDomain && dispatch(settingsActions.updateDomains([defaultDomain]))}
                />
              </Tooltip>
            )}
            <Tooltip title={t("components.single-cell.heatmap.download")}>
              <Button size="small" icon={<AiOutlineDownload />} onClick={downloadPng} />
            </Tooltip>
          </Space>
        }
      >
        {alerts.map((a) => (
          <Alert key={a.key} type="warning" showIcon className="sc-alert" message={a.message} description={a.description} />
        ))}
        {missingGenomes > 0 && heatmapType === "cn" && (
          <Alert
            type="info"
            showIcon
            className="sc-alert"
            message={t("components.single-cell.heatmap.missing-genomes", { count: missingGenomes })}
          />
        )}
        <div ref={containerRef} className="sc-heatmap-container">
          <div ref={canvasHolder} className="sc-heatmap-row" style={{ height }}>
            {hasTree && (
              <PhylogenyCanvas
                layout={tree.data.layout}
                nRows={nRows}
                width={treeWidth}
                height={height}
                leafClones={leafClones}
                cloneColors={cloneColors}
                selectedLeafRange={selectedLeafRange}
                onSelectRange={handleTreeSelect}
                onHoverNode={(node, event) =>
                  node
                    ? hoverCell(
                        node.firstLeaf,
                        node.isLeaf
                          ? []
                          : [[
                              t("components.single-cell.tooltip.clade"),
                              t("components.single-cell.heatmap.cell-count", {
                                count: node.lastLeaf - node.firstLeaf + 1,
                              }),
                            ]],
                        event
                      )
                    : setHover(null)
                }
              />
            )}
            <HeatmapCanvas
              width={ANNOTATION_WIDTH}
              height={height}
              nRows={nRows}
              cols={annotationCols}
              colorAt={annotationColor}
              onClick={handleRowClick}
              onHover={({ row }, event) => hoverCell(row, null, event)}
              onLeave={() => setHover(null)}
            />
            {active ? (
              <HeatmapCanvas
                width={heatWidth}
                height={height}
                nRows={nRows}
                cols={active.cols}
                colorAt={active.colorAt}
                separators={active.axis.separators}
                highlightRows={selectedRows.size <= 50 ? selectedRows : null}
                onClick={handleRowClick}
                onDrag={heatmapType === "cn" ? handlePan : undefined}
                onWheelZoom={heatmapType === "cn" ? handleWheelZoom : undefined}
                onHover={({ row, col }, event) => hoverCell(row, active.describe(row, col), event)}
                onLeave={() => setHover(null)}
              />
            ) : (
              <div className="sc-heatmap-empty" style={{ width: heatWidth, height }}>
                <Text type="secondary">{t("components.single-cell.heatmap.no-matrix")}</Text>
              </div>
            )}
            {hover && (
              <div className="sc-tooltip" style={{ left: Math.max(0, hover.left), top: hover.top }}>
                {hover.lines.map(([k, v]) => (
                  <div key={k}>
                    <span className="sc-tooltip-key">{k}</span> {`${v}`}
                  </div>
                ))}
              </div>
            )}
          </div>
          {active && (
            <div
              className="sc-axis"
              style={{
                marginLeft: treeWidth + (hasTree ? GAP : 0) + ANNOTATION_WIDTH + GAP,
                width: heatWidth,
                height: AXIS_HEIGHT,
              }}
            >
              {active.axis.spans
                .filter((s) => s.x1 - s.x0 >= 14)
                .map((s, k) => (
                  <span
                    key={`${s.chromosome}-${k}`}
                    className={heatmapType === "cn" ? "sc-axis-label sc-axis-link" : "sc-axis-label"}
                    style={{ left: s.x0, width: s.x1 - s.x0 }}
                    title={
                      heatmapType === "cn"
                        ? t("components.single-cell.heatmap.zoom-chromosome", { chromosome: s.chromosome })
                        : s.chromosome
                    }
                    onClick={() => {
                      const c = chromoBins[s.chromosome];
                      if (heatmapType === "cn" && c) {
                        dispatch(settingsActions.updateDomains([[c.startPlace, c.endPlace]]));
                      }
                    }}
                  >
                    {s.chromosome}
                  </span>
                ))}
            </div>
          )}
          <div className="sc-heatmap-footer">
            <HeatmapLegend type={heatmapType} maxJunctionCn={junctions.data?.maxCn} cloneColors={cloneColors} />
            <Text type="secondary" className="sc-hint">
              {t("components.single-cell.heatmap.hint")}
            </Text>
          </div>
        </div>
      </Card>
    </Wrapper>
  );
}
