import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Empty, Modal, Space, Tag, Typography } from "antd";
import { DownloadOutlined, ExpandOutlined, LinkOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "../cohort/useCohortExport";
import { PAPER_FIGURES_DIR, PAPER_MANIFEST_FILE, anchoredPanels, bestImage, formatBuilt, panelAt, panelRegions, panelTarget, parsePaperManifest, targetSearch } from "../../../helpers/singleCell/paperManifest";
import { announceCohortView, requestHelpTarget } from "../../../helpers/singleCell/helpNav";
import { PanelModal, STATUS_TAG_COLOR, ZoomPanImage, targetLabel } from "./paperFiguresViewer";
import { tryGet } from "../../../redux/singleCell/loaders";
import { highlightRects, hitAt, markPositions, parseSidecar, plotHitAt, rowsBetween } from "../../../helpers/singleCell/paperSidecar";
import { encodeGroups } from "../../../helpers/singleCell/savedGroups";

const rowsets = (sidecar) => [...new Set((sidecar?.regions || []).filter((r) => r.kind === "rows").map((r) => r.rowset || r.id))];
/** Highlight rectangles of cell ids in every rows region, and ring positions of matching point marks. */
function linkedMarks(sidecar, ids) {
  if (!sidecar || !ids?.size) return { rects: [], rings: [] };
  const rects = rowsets(sidecar).flatMap((rs) => highlightRects(sidecar, rs, rs, ids));
  return { rects, rings: markPositions(sidecar, "cell", ids) };
}
const fmtVal = (v) => (typeof v === "number" ? (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100) : `${v}`);

/** gOS link that opens a patient's Single-Cell tab with these cells selected (saved group carried in the URL). */
function cellsUrl(patient, cells, name) {
  const p = new URLSearchParams(window.location.search);
  ["scview", "figmode", "figpanel", "figpatient", "scsel", "scgroups"].forEach((k) => p.delete(k));
  p.set("report", patient);
  p.set("tab", "7");
  p.set("scgroups", encodeGroups({ [patient]: [{ name, cells }] }));
  p.set("scsel", name);
  return `${window.location.pathname}?${p.toString()}`;
}

const { Text } = Typography;
const PT_PX = 96 / 72;

/** The synced paper-figures manifest of the current dataset: { status, manifest }. */
export function usePaperManifest() {
  const dataset = useSelector((s) => s.Settings?.dataset);
  const base = dataset?.dataPath ? `${dataset.dataPath}_cohort/${PAPER_FIGURES_DIR}/` : "";
  const ex = useCohortExport(dataset?.dataPath ? dataset : null, PAPER_MANIFEST_FILE);
  const manifest = useMemo(() => parsePaperManifest(ex.data, base), [ex.data, base]);
  return { status: ex.status, manifest };
}

/** Open a panel's interactive counterpart from anywhere in the cohort pages. */
export function openPaperTarget(target) {
  const search = targetSearch(target, window.location.search);
  if (target.kind === "tab") {
    window.location.assign(`${window.location.pathname}${search}`);
    return;
  }
  window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  const view = target.kind === "interactive" ? "figures" : target.scview;
  announceCohortView(view);
  requestHelpTarget({ scope: "cohort", view });
}

/**
 * One manuscript figure as its own page: the exact figure (SVG as built by the
 * figure scripts) on the paper's layout, with a panel layer on top (hover a
 * panel for its status, click to open it large or go to its interactive view),
 * the build date, PDF download, and the figure's panel notes underneath.
 * label: "Fig 4" (manifest figure label).
 */
export default function PaperFigurePage({ label }) {
  const { status, manifest } = usePaperManifest();
  const fig = manifest?.figures.find((f) => f.label === label) || null;
  const [ref, measured] = useContainerWidth(1100);
  const [hover, setHover] = useState(null);
  const [tip, setTip] = useState(null);
  const [open, setOpen] = useState(null);
  const [zoom, setZoom] = useState(false);
  const anchors = useMemo(() => anchoredPanels(fig), [fig]);
  const regions = useMemo(() => (fig?.widthPt ? panelRegions(anchors, fig.widthPt, fig.heightPt) : []), [anchors, fig]);
  const pageRef = useRef(null);
  // interactive-paper layer: plot areas from the figure script's sidecar (hover a row, click or drag to select, brushed across the panel)
  const [sidecar, setSidecar] = useState(null);
  useEffect(() => {
    setSidecar(null);
    if (!fig?.interactive) return undefined;
    let live = true;
    tryGet(fig.interactive).then((r) => live && setSidecar(r.status === "ok" ? parseSidecar(r.data) : null));
    return () => {
      live = false;
    };
  }, [fig?.interactive]);
  const [hit, setHit] = useState(null);
  const [plotHit, setPlotHit] = useState(null);
  const [sel, setSel] = useState(null); // { rowset, regionId, ids: Set, patient, label }
  const brush = useRef(null);
  const [brushBox, setBrushBox] = useState(null);
  useEffect(() => setSel(null), [label]);
  if (status === "loading") return <Text type="secondary">Loading the paper figures…</Text>;
  if (!manifest) return <Empty description="not available (paper figures not synced: srctools inst/paper_figures/sync_gos.sh)" />;
  if (!fig) return <Empty description={`not available (${label} is not in the synced figures)`} />;
  const natW = (fig.widthPt || 600) * PT_PX;
  const width = Math.max(320, Math.min(measured, Math.round(natW * 1.9)));
  const k = width / (fig.widthPt || 600); // px per pt
  const height = (fig.heightPt || 600) * k;
  const at = (e) => {
    const r = pageRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k, e.clientX - r.left, e.clientY - r.top];
  };
  const region = hover ? regions.find((b) => b.letter === hover.letter) : null;
  return (
    <div ref={ref} className="sc-paperpage">
      <div className="sc-paper-bar">
        <div className="sc-paper-title" style={{ marginBottom: 0 }}>
          <b>{fig.label}</b> {fig.title}
        </div>
        <Space size={10} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {`Built ${formatBuilt(fig.built)} · synced ${formatBuilt(manifest.synced)}${manifest.srctools?.sha ? ` · srctools ${manifest.srctools.sha}` : ""}`}
          </Text>
          <Button size="small" icon={<ExpandOutlined />} onClick={() => setZoom(true)}>
            Zoom
          </Button>
          {fig.pdf && (
            <Button size="small" icon={<DownloadOutlined />} href={fig.pdf} target="_blank" rel="noopener noreferrer">
              PDF
            </Button>
          )}
        </Space>
      </div>
      {sel && (
        <div className="sc-paperpage-selbar">
          <b>{`${sel.ids.size} cell${sel.ids.size === 1 ? "" : "s"} selected`}</b>
          <Text type="secondary">{` in ${fig.label}${sel.patient ? ` · ${sel.patient}` : ""}`}</Text>
          {sel.patient && (
            <Button size="small" type="primary" href={cellsUrl(sel.patient, [...sel.ids], `${fig.label} selection`)} target="_blank" rel="noopener noreferrer">
              {`Open in ${sel.patient}`}
            </Button>
          )}
          <Button size="small" onClick={() => setSel(null)}>
            Clear
          </Button>
        </div>
      )}
      <div
        ref={pageRef}
        className="sc-paperpage-sheet"
        style={{ position: "relative", width, height, cursor: hit ? "crosshair" : hover ? "pointer" : "default", touchAction: "none", userSelect: "none" }}
        onPointerDown={(e) => {
          const [x, y] = at(e);
          const h = hitAt(sidecar, x, y);
          if (h) brush.current = { h, y0: y, moved: false };
        }}
        onPointerMove={(e) => {
          const [x, y, px, py] = at(e);
          const b = brush.current;
          if (b) {
            if (Math.abs(y - b.y0) > 2) b.moved = true;
            if (b.moved) setBrushBox({ x: b.h.region.x, w: b.h.region.w, y0: Math.min(b.y0, y), y1: Math.max(b.y0, y) });
            return;
          }
          const h = hitAt(sidecar, x, y);
          setHit(h);
          const ph = h ? null : plotHitAt(sidecar, x, y);
          setPlotHit(ph && (ph.fields || ph.axis) ? ph : null);
          const p = h || (ph && ph.fields) ? null : panelAt(anchors, x, y);
          setHover(p);
          setTip(h || ph || p ? { px, py } : null);
        }}
        onPointerUp={(e) => {
          const b = brush.current;
          brush.current = null;
          setBrushBox(null);
          if (!b) return;
          const [, y] = at(e);
          const r = b.h.region;
          const ids = b.moved ? rowsBetween(r, b.y0, y) : [b.h.id];
          if (!ids.length) return;
          const add = e.shiftKey && sel && sel.rowset === r.rowset ? [...sel.ids] : [];
          setSel({ rowset: r.rowset, regionId: r.id, ids: new Set([...add, ...ids]), patient: r.patient, label: r.label });
        }}
        onMouseLeave={() => {
          setHover(null);
          setTip(null);
          setHit(null);
          setPlotHit(null);
        }}
        onClick={(e) => {
          const [x, y] = at(e);
          if (hitAt(sidecar, x, y)) return; // handled as a row selection
          const ph = plotHitAt(sidecar, x, y);
          const cell = ph?.fields?.cell || ph?.fields?.cell_id;
          if (cell) {
            const patient = ph.fields.patient || ph.region.patient || sel?.patient || null;
            const keep = e.shiftKey && sel && sel.patient === patient ? [...sel.ids] : [];
            setSel({ rowset: null, regionId: null, ids: new Set([...keep, `${cell}`]), patient, label: ph.region.panel });
            return;
          }
          if (ph?.fields?.patient) {
            const q = new URLSearchParams(window.location.search);
            ["scview", "figmode", "figpanel", "figpatient"].forEach((key) => q.delete(key));
            q.set("report", ph.fields.patient);
            window.open(`${window.location.pathname}?${q.toString()}`, "_blank", "noopener");
            return;
          }
          const p = panelAt(anchors, x, y);
          if (p) setOpen(p);
        }}
      >
        <img src={bestImage(fig)} alt={`${fig.label}: ${fig.title}`} draggable={false} style={{ width, height, display: "block", userSelect: "none" }} />
        {sel &&
          (() => {
            const lm = linkedMarks(sidecar, sel.ids);
            return [
              ...lm.rects.map((r, i) => <div key={`s${i}`} className="sc-paperpage-sel" style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: Math.max(1.5, r.h * k) }} />),
              ...lm.rings.map(([x, y], i) => <div key={`sr${i}`} className="sc-paperpage-ring is-sel" style={{ left: x * k - 5, top: y * k - 5 }} />),
            ];
          })()}
        {plotHit?.page && <div className="sc-paperpage-ring" style={{ left: plotHit.page[0] * k - 6, top: plotHit.page[1] * k - 6, width: 12, height: 12 }} />}
        {plotHit?.rect && <div className="sc-paperpage-hover" style={{ left: plotHit.rect.x * k, top: plotHit.rect.y * k, width: Math.max(2, plotHit.rect.w * k), height: Math.max(2, plotHit.rect.h * k), background: "transparent", outline: "2px solid #fa8c16" }} />}
        {plotHit?.fields?.cell &&
          (() => {
            const lm = linkedMarks(sidecar, new Set([`${plotHit.fields.cell}`]));
            return lm.rects.map((r, i) => <div key={`l${i}`} className="sc-paperpage-hover" style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: Math.max(2, r.h * k) }} />);
          })()}
        {plotHit && tip && !hit && (
          <div className="sc-tooltip" style={{ position: "absolute", left: Math.min(tip.px + 14, width - 280), top: tip.py + 14, maxWidth: 280, pointerEvents: "none", zIndex: 5 }}>
            <div style={{ fontWeight: 600 }}>{plotHit.fields ? plotHit.fields.cell || plotHit.fields.patient || plotHit.fields.gene || plotHit.fields.label || `${fig.label}${plotHit.region.panel || ""}` : `${fig.label}${plotHit.region.panel || ""}`}</div>
            {plotHit.fields &&
              Object.entries(plotHit.fields)
                .filter(([key]) => key !== "cell")
                .map(([key, v]) => <div key={key}>{`${key}: ${fmtVal(v)}`}</div>)}
            {plotHit.axis && <div>{`x: ${plotHit.axis.x == null ? "–" : fmtVal(plotHit.axis.x)} · y: ${plotHit.axis.y == null ? "–" : fmtVal(plotHit.axis.y)}`}</div>}
            <div style={{ opacity: 0.8 }}>{plotHit.fields?.cell ? "click to select (shift adds)" : plotHit.fields?.patient ? "click to open the patient" : "click: open the panel"}</div>
          </div>
        )}
        {hit &&
          highlightRects(sidecar, hit.region.rowset, hit.region.id, new Set([hit.id])).map((r, i) => (
            <div key={`h${i}`} className="sc-paperpage-hover" style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: Math.max(2, r.h * k) }} />
          ))}
        {brushBox && <div className="sc-paperpage-brush" style={{ left: brushBox.x * k, top: brushBox.y0 * k, width: brushBox.w * k, height: (brushBox.y1 - brushBox.y0) * k }} />}
        {region && !hit && !plotHit?.fields && (
          <div
            className="sc-paperpage-region"
            style={{ left: region.x0 * k, top: region.y0 * k, width: (region.x1 - region.x0) * k, height: (region.y1 - region.y0) * k }}
          />
        )}
        {hit && tip && (
          <div className="sc-tooltip" style={{ position: "absolute", left: Math.min(tip.px + 14, width - 280), top: tip.py + 14, maxWidth: 280, pointerEvents: "none", zIndex: 5 }}>
            <div style={{ fontWeight: 600 }}>{hit.id}</div>
            <div>{`${fig.label}${hit.region.panel || ""} · ${hit.region.label}${hit.region.patient ? ` · ${hit.region.patient}` : ""}`}</div>
            {hit.extras.map((x) => (
              <div key={x.label}>{`${x.label}: ${typeof x.value === "number" ? Math.round(x.value * 10) / 10 : x.value}`}</div>
            ))}
            {hit.position && <div>{`chr${hit.position.chr}:${hit.position.pos.toLocaleString()}`}</div>}
            <div style={{ opacity: 0.8 }}>click to select · drag to select rows (shift adds)</div>
          </div>
        )}
        {hover && tip && !hit && !plotHit && (
          <div className="sc-tooltip" style={{ position: "absolute", left: Math.min(tip.px + 14, width - 280), top: tip.py + 14, maxWidth: 280, pointerEvents: "none", zIndex: 5 }}>
            <div style={{ fontWeight: 600 }}>{`${fig.label}${hover.letter}`}</div>
            <div>{hover.status}</div>
            {hover.reason && <div style={{ opacity: 0.8 }}>{hover.reason.length > 160 ? `${hover.reason.slice(0, 160)}…` : hover.reason}</div>}
            <div style={{ opacity: 0.8 }}>{panelTarget(hover.view) ? "click: open large, and its interactive view" : "click: open large"}</div>
          </div>
        )}
      </div>
      <div className="sc-paperpage-notes">
        <div className="sc-paper-subhead">{`${fig.label} · panel notes (build status from the figure scripts)`}</div>
        {fig.panels.map((p) => {
          const t = panelTarget(p.view);
          return (
            <div key={p.letter} className="sc-paperpage-note">
              <Button type="link" size="small" style={{ padding: 0, fontWeight: 700 }} onClick={() => setOpen(p)}>
                {p.letter}
              </Button>
              <Tag color={STATUS_TAG_COLOR[p.status] || "default"} style={{ marginInlineEnd: 0 }}>
                {p.status}
              </Tag>
              <Text style={{ fontSize: 12 }}>{p.reason || "no notes"}</Text>
              {t && (
                <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openPaperTarget(t)}>
                  {targetLabel(t)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <PanelModal fig={fig} panel={open} onClose={() => setOpen(null)} onOpenTarget={openPaperTarget} />
      <Modal open={zoom} onCancel={() => setZoom(false)} footer={null} width="96vw" title={`${fig.label} · ${fig.title}`}>
        {zoom && <ZoomPanImage src={bestImage(fig)} alt={fig.label} width={natW} height={(fig.heightPt || 600) * PT_PX} viewHeight={Math.max(400, (window.innerHeight || 900) - 220)} />}
      </Modal>
    </div>
  );
}

/** Row of links to the figure tabs (landing pages): one thumbnail button per figure, in the paper's order. */
export function PaperFigureLinks({ onView, views }) {
  const { manifest } = usePaperManifest();
  if (!manifest) return null;
  const byLabel = new Map(manifest.figures.map((f) => [f.label, f]));
  const items = views.map((v) => ({ ...v, fig: byLabel.get(v.label) })).filter((x) => x.fig);
  if (!items.length) return null;
  return (
    <div className="sc-paperlinks">
      <div className="sc-paperlinks-head">
        <b>The paper</b>
        <Text type="secondary" style={{ fontSize: 12 }}>{` · each figure exactly as built, panels linked to their interactive views · built ${formatBuilt(manifest.synced)}`}</Text>
      </div>
      <div className="sc-paperlinks-row">
        {items.map(({ key, fig }) => (
          <button key={key} type="button" className="sc-paperlinks-item" onClick={() => onView(key)} title={fig.title}>
            <img src={fig.png || bestImage(fig)} alt="" loading="lazy" />
            <span>{fig.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
