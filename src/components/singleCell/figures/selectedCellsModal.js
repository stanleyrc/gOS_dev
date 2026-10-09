import React, { useCallback, useMemo } from "react";
import { Button, Col, Modal, Row, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import FigureCanvas, { fitText } from "./figureCanvas";
import { drawXAxis, textRole } from "./figureKit";
import CloneFigure from "./cloneFigure";
import useContainerWidth from "../useContainerWidth";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { geneSetColor, isNormalClone, quantiles } from "../../../helpers/singleCell/figures";
import { countBy, logKde, niceLogDomain } from "../../../helpers/singleCell/figureMath";
import { useCellSelection } from "./cellSelection";

const { Text } = Typography;
const LOG_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const ACCENT = "#1677ff";

/**
 * Selected vs other tumour cells, per amplicon: upper half-violin = selected
 * (accent), lower = the rest (grey), medians marked, carrier % at the right.
 */
function CompareViolins({ groups, selected, tumour, minCn = 1 }) {
  const [ref, measured] = useContainerWidth(600);
  const width = Math.max(360, measured);
  const ROW = 44;
  const TOP = 4;
  const LAB = 90;
  const RIGHT = 120;
  const rows = useMemo(
    () =>
      groups.map((g) => {
        const sel = [];
        const oth = [];
        g.cellIds.forEach((id, i) => {
          if (!tumour.has(id)) return;
          (selected.has(id) ? sel : oth).push(g.cn[i]);
        });
        return { g, sel, oth };
      }),
    [groups, selected, tumour]
  );
  const [LO, HI] = useMemo(() => niceLogDomain(rows.flatMap((r) => [...r.sel, ...r.oth])), [rows]);
  const height = TOP + rows.length * ROW + 34;
  const vx0 = LAB + 8;
  const vx1 = width - RIGHT;
  const lx = (v) => vx0 + ((Math.log10(Math.min(HI, Math.max(LO, v))) - Math.log10(LO)) / (Math.log10(HI) - Math.log10(LO))) * (vx1 - vx0);
  const draw = useCallback(
    (ctx, c) => {
      const yAxis = TOP + rows.length * ROW;
      drawXAxis(ctx, c, { ticks: LOG_TICKS.filter((v) => v >= LO && v <= HI).map((v) => ({ v, x: lx(v) })), x0: vx0, x1: vx1, y: yAxis, at: "bottom", title: "Copies per cell (log scale)", gridFrom: TOP, gridTo: yAxis });
      rows.forEach((r, i) => {
        const cy = TOP + i * ROW + ROW / 2;
        const half = ROW * 0.44;
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "right";
        ctx.fillText(fitText(ctx, `ec${r.g.key}`, LAB - 4), LAB, cy);
        const side = (vals, dir, fill, alpha) => {
          const pos = vals.filter((v) => v >= minCn);
          if (pos.length < 2) return;
          const { x, y } = logKde(pos, { lo: LO, hi: HI, n: 100 });
          const X = (k) => vx0 + ((x[k] - x[0]) / (x[x.length - 1] - x[0])) * (vx1 - vx0);
          ctx.beginPath();
          ctx.moveTo(X(0), cy);
          for (let k = 0; k < y.length; k += 1) ctx.lineTo(X(k), cy + dir * y[k] * half);
          ctx.lineTo(X(y.length - 1), cy);
          ctx.closePath();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.globalAlpha = 1;
          const med = quantiles(pos)[1];
          ctx.fillStyle = fill;
          ctx.fillRect(lx(med) - 1, cy + (dir < 0 ? -half : 0), 2, half);
        };
        side(r.oth, 1, c.dark ? "#9a9a9a" : "#8c8c8c", 0.45);
        side(r.sel, -1, c.dark ? "#69b1ff" : ACCENT, 0.55);
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(vx0, cy + 0.5);
        ctx.lineTo(vx1, cy + 0.5);
        ctx.stroke();
        const fs = r.sel.length ? r.sel.filter((v) => v >= minCn).length / r.sel.length : NaN;
        const fo = r.oth.length ? r.oth.filter((v) => v >= minCn).length / r.oth.length : NaN;
        textRole(ctx, c, "tick", "text");
        ctx.textAlign = "left";
        ctx.fillStyle = c.dark ? "#69b1ff" : ACCENT;
        ctx.fillText(`selected ${Number.isFinite(fs) ? Math.round(100 * fs) : "–"}%`, vx1 + 10, cy - 8);
        textRole(ctx, c, "tick", "textSecondary");
        ctx.textAlign = "left";
        ctx.fillText(`others ${Number.isFinite(fo) ? Math.round(100 * fo) : "–"}%`, vx1 + 10, cy + 8);
      });
      return [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, width, LO, HI]
  );
  if (!rows.length) return <div ref={ref} />;
  return (
    <div ref={ref}>
      <FigureCanvas width={width} height={height} draw={draw} ariaLabel="Amplicon copies in the selected cells against the other tumour cells" />
    </div>
  );
}

/**
 * Popup for the current selection: who the cells are (clones, states), the
 * clone figure restricted to them, their amplicon copies against the other
 * tumour cells, and a table of the cells (copy ids, open a cell's report).
 */
export default function SelectedCellsModal({ per, cnRows = {}, chromoBins, cloneColors = {}, domains = [], genes = [], onOpenCell }) {
  const { selection, open, setOpen, select } = useCellSelection();
  const p = selection ? per.find((x) => x.patient === selection.patient) : null;
  const selCells = useMemo(() => (p && selection ? p.cells.filter((c) => selection.cells.has(c.cell_id)) : []), [p, selection]);
  const tumour = useMemo(() => new Set((p?.cells || []).filter((c) => !isNormalClone(c.clone_id)).map((c) => c.cell_id)), [p]);
  const stateColors = useMemo(() => annotationColors((p?.cells || []).map((c) => c.state).filter((s) => s != null && s !== "")), [p]);
  const tableRows = useMemo(() => {
    if (!p) return [];
    const idx = p.groups.map((g) => new Map(g.cellIds.map((id, i) => [id, g.cn[i]])));
    return selCells.map((c) => {
      const row = { key: c.cell_id, cell: c.cell_id, clone: c.clone_id ?? "–", state: c.state ?? "–", ploidy: c.ploidy };
      p.groups.forEach((g, k) => (row[`g:${g.key}`] = idx[k].get(c.cell_id)));
      return row;
    });
  }, [p, selCells]);

  if (!selection || !p) return null;
  const copyIds = () => {
    const text = [...selection.cells].join("\n");
    navigator.clipboard?.writeText(text).then(
      () => message.success(`Copied ${selection.cells.size} cell ids`),
      () => message.error("Copy failed")
    );
  };
  const columns = [
    { title: "Cell", dataIndex: "cell", key: "cell", sorter: (a, b) => a.cell.localeCompare(b.cell, undefined, { numeric: true }), render: (v) => (onOpenCell ? <Button type="link" size="small" style={{ padding: 0, height: "auto" }} onClick={() => { setOpen(false); onOpenCell(v); }}>{v}</Button> : v) },
    { title: "Clone", dataIndex: "clone", key: "clone", width: 110, sorter: (a, b) => `${a.clone}`.localeCompare(`${b.clone}`, undefined, { numeric: true }), render: (v) => <Space size={4}><span className="sc-fig-swatch" style={{ background: cloneColors[v] || "#bfbfbf" }} />{v}</Space> },
    { title: "State", dataIndex: "state", key: "state", width: 100, sorter: (a, b) => `${a.state}`.localeCompare(`${b.state}`), render: (v) => <Space size={4}><span className="sc-fig-swatch" style={{ background: stateColors[v] || "#e0e0e0" }} />{v}</Space> },
    ...p.groups.slice(0, 5).map((g) => ({
      title: <span style={{ color: geneSetColor(g.key) === "#9B8AAE" ? undefined : geneSetColor(g.key) }}>{`ec${g.key}`}</span>,
      dataIndex: `g:${g.key}`,
      key: `g:${g.key}`,
      width: 96,
      align: "right",
      sorter: (a, b) => (a[`g:${g.key}`] ?? -1) - (b[`g:${g.key}`] ?? -1),
      render: (v) => (Number.isFinite(v) ? v.toFixed(1) : "–"),
    })),
  ];

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      width="min(1500px, 94vw)"
      destroyOnClose
      title={
        <Space size={8} wrap>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>{`${selection.cells.size} cells`}</Tag>
          <Text strong>{p.patient}</Text>
          <Text type="secondary">{selection.label}</Text>
        </Space>
      }
    >
      <Space size={[16, 6]} wrap style={{ marginBottom: 8 }}>
        <Space size={4} wrap>
          <Text type="secondary">Clones</Text>
          {countBy(selCells, "clone_id").map(([k, v]) => (
            <Tag key={k} style={{ marginInlineEnd: 0, borderColor: cloneColors[k] || undefined }}>
              <span className="sc-fig-swatch" style={{ background: cloneColors[k] || "#bfbfbf", marginRight: 4 }} />
              {`${k} ${v}`}
            </Tag>
          ))}
        </Space>
        <Space size={4} wrap>
          <Text type="secondary">States</Text>
          {countBy(selCells, "state").map(([k, v]) => (
            <Tag key={k} style={{ marginInlineEnd: 0 }}>
              <span className="sc-fig-swatch" style={{ background: stateColors[k] || "#e0e0e0", marginRight: 4 }} />
              {`${k} ${v}`}
            </Tag>
          ))}
        </Space>
        <Tooltip title="Copy the cell ids, one per line">
          <Button size="small" icon={<CopyOutlined />} onClick={copyIds}>
            Copy ids
          </Button>
        </Tooltip>
        {selection.cells.size < tumour.size && (
          <Button size="small" onClick={() => select(p.patient, [...tumour].filter((id) => !selection.cells.has(id)), { label: `tumour cells not in (${selection.label})` })}>
            Invert (tumour cells)
          </Button>
        )}
      </Space>
      <div className="sc-fig-subtitle">The selected cells <span>tree pruned to the selection</span></div>
      <CloneFigure
        patient={p.patient}
        layout={p.tree}
        cells={selCells}
        groups={p.groups}
        snv={p.snvPacked ? { packed: p.snvPacked, nVariants: p.nVariants } : null}
        cnEntry={cnRows[p.patient]}
        domains={domains}
        chromoBins={chromoBins}
        genes={genes}
        cloneColors={cloneColors}
        maxPlotHeight={Math.min(520, Math.max(120, selCells.length * 6))}
        minWidth={600}
      />
      <Row gutter={16} style={{ marginTop: 12 }}>
        <Col xs={24} xl={11}>
          <div className="sc-fig-subtitle">Amplicon copies <span>selected (up) vs other tumour cells (down)</span></div>
          <CompareViolins groups={p.groups} selected={selection.cells} tumour={tumour} />
        </Col>
        <Col xs={24} xl={13}>
          <div className="sc-fig-subtitle">Cells <span>click a name to open its report</span></div>
          <Table size="small" columns={columns} dataSource={tableRows} pagination={{ pageSize: 12, size: "small", showSizeChanger: false }} scroll={{ x: true }} />
        </Col>
      </Row>
    </Modal>
  );
}
