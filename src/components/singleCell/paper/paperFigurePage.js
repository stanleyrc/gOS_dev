import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Empty, Modal, Segmented, Space, Tag, Typography } from "antd";
import { DownloadOutlined, ExpandOutlined, LinkOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "../cohort/useCohortExport";
import { PAPER_FIGURES_DIR, PAPER_MANIFEST_FILE, anchoredPanels, bestImage, formatBuilt, panelAt, panelRegions, panelTarget, parsePaperManifest, targetSearch } from "../../../helpers/singleCell/paperManifest";
import { announceCohortView, requestHelpTarget } from "../../../helpers/singleCell/helpNav";
import { PanelModal, STATUS_TAG_COLOR, ZoomPanImage, targetLabel } from "./paperFiguresViewer";
import { tryGet } from "../../../redux/singleCell/loaders";
import { highlightRects, hitAt, markPositions, panelTables, parseSidecar, plotHitAt, rowsBetween, sidecarExtras } from "../../../helpers/singleCell/paperSidecar";
import { applyPaperTokens, paperTokensVersion } from "../../../helpers/singleCell/paperPalette";
import { encodeGroups } from "../../../helpers/singleCell/savedGroups";

const InteractiveSlot = React.lazy(() => import("./interactiveSlot"));
const PatientDrawer = React.lazy(() => import("./patientDrawer"));

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
  // live panels: the patient figure of each patient that has one (largest panel region), default Interactive for the first
  const slots = useMemo(() => {
    const by = new Map();
    (fig?.panels || []).forEach((p) => {
      const t = p.view;
      if (!t || t.panel !== "patient-figure" || !t.patient) return;
      const r = regions.find((b) => b.letter === p.letter);
      if (!r) return;
      const area = (r.x1 - r.x0) * (r.y1 - r.y0);
      const cur = by.get(t.patient);
      const letters = cur ? [...cur.lettersList, p.letter] : [p.letter];
      if (!cur || area > cur.area) by.set(t.patient, { key: t.patient, patient: t.patient, area, ...r, lettersList: letters });
      else cur.lettersList = letters;
    });
    return [...by.values()].map((sl) => ({ ...sl, letters: sl.lettersList.join(", ") }));
  }, [fig, regions]);
  const [slotModes, setSlotModes] = useState({});
  useEffect(() => setSlotModes({}), [label]);
  const slotMode = useMemo(() => {
    const out = {};
    const chosen = Object.entries(slotModes).find(([, m]) => m === "interactive")?.[0];
    slots.forEach((sl, i) => {
      out[sl.key] = chosen ? (sl.key === chosen ? "interactive" : "pdf") : slotModes[sl.key] || (i === 0 ? "interactive" : "pdf");
    });
    return out;
  }, [slots, slotModes]);
  const setMode = (key, m) => setSlotModes((cur) => (m === "interactive" ? { [key]: "interactive" } : { ...Object.fromEntries(Object.keys(cur).map((x) => [x, "pdf"])), [key]: "pdf" }));
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
  // the paper's style tokens (CN scale, states, clades): applied before the live panels draw
  const [tokens, setTokens] = useState("loading");
  useEffect(() => {
    if (!manifest) return undefined;
    if (!manifest.styleTokens) {
      setTokens("none");
      return undefined;
    }
    let live = true;
    tryGet(manifest.styleTokens).then((r) => {
      if (!live) return;
      setTokens(r.status === "ok" && applyPaperTokens(r.data) ? `v${paperTokensVersion()}` : "none");
    });
    return () => {
      live = false;
    };
  }, [manifest]);
  const [hit, setHit] = useState(null);
  const [plotHit, setPlotHit] = useState(null);
  const [patientOpen, setPatientOpen] = useState(null); // patient summary drawer (cohort panels)
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
  // pointer -> page pt (and px inside the page wrapper) for a slice starting at page y0
  const at = (e, y0 = 0) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / k, y0 + (e.clientY - r.top) / k, e.clientX - r.left, e.clientY - r.top + y0 * k];
  };
  const region = hover ? regions.find((b) => b.letter === hover.letter) : null;
  // interactive slots: key panels shown as the live gOS component on the figure's grid (full-width panels replace their
  // band of the page, narrower ones open under it); one patient at a time (the store holds one patient)
  const pageH = fig.heightPt || 600;
  const pageW = fig.widthPt || 600;
  const segments = [];
  let yc = 0;
  slots
    .filter((sl) => slotMode[sl.key] === "interactive")
    .sort((a, b) => a.y0 - b.y0)
    .forEach((sl) => {
      const wide = sl.x1 - sl.x0 >= 0.7 * pageW;
      const cut0 = wide ? Math.max(yc, sl.y0) : Math.max(yc, sl.y1);
      const cut1 = wide ? sl.y1 : sl.y1;
      if (cut0 > yc) segments.push({ type: "svg", y0: yc, y1: cut0 });
      segments.push({ type: "slot", slot: sl });
      yc = Math.max(yc, cut1);
    });
  if (yc < pageH) segments.push({ type: "svg", y0: yc, y1: pageH });
  const renderSheet = (y0, y1) => (
      <div
        key={`sheet${y0}`}
        className="sc-paperpage-sheet"
        style={{ position: "relative", width, height: (y1 - y0) * k, overflow: "hidden", cursor: hit ? "crosshair" : hover ? "pointer" : "default", touchAction: "none", userSelect: "none" }}
        onPointerDown={(e) => {
          const [x, y] = at(e, y0);
          const h = hitAt(sidecar, x, y);
          if (h) brush.current = { h, y0: y, moved: false };
        }}
        onPointerMove={(e) => {
          const [x, y, px, py] = at(e, y0);
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
          const [, y] = at(e, y0);
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
          const [x, y] = at(e, y0);
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
            setPatientOpen(`${ph.fields.patient}`);
            return;
          }
          const p = panelAt(anchors, x, y);
          if (p) setOpen(p);
        }}
      >
        <div style={{ position: "absolute", left: 0, top: -y0 * k, width, height }}>
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
            <div style={{ opacity: 0.8 }}>{plotHit.fields?.cell ? "click to select (shift adds)" : plotHit.fields?.patient ? "click for the patient summary" : "click: open the panel"}</div>
          </div>
        )}
        {hit &&
          highlightRects(sidecar, hit.region.rowset, hit.region.id, new Set([hit.id])).map((r, i) => (
            <div key={`h${i}`} className="sc-paperpage-hover" style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: Math.max(2, r.h * k) }} />
          ))}
        {brushBox && <div className="sc-paperpage-brush" style={{ left: brushBox.x * k, top: brushBox.y0 * k, width: brushBox.w * k, height: (brushBox.y1 - brushBox.y0) * k }} />}
        {slots
          .filter((sl) => slotMode[sl.key] !== "interactive")
          .map((sl) => (
            <Button
              key={`live${sl.key}`}
              size="small"
              type="primary"
              ghost
              className="sc-paperslot-live"
              style={{ position: "absolute", left: sl.x1 * k - 150, top: sl.y0 * k + 4, zIndex: 4 }}
              onClick={(e) => {
                e.stopPropagation();
                setMode(sl.key, "interactive");
              }}
            >
              {`Interactive (${sl.patient})`}
            </Button>
          ))}
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
      </div>
  );
  const renderSlot = (seg) => (
    <div key={`slot${seg.slot.key}`} className="sc-paperslot-wrap" style={{ width }}>
      <div className="sc-paperslot-head">
        <b>{`${fig.label}${seg.slot.letters}`}</b>
        <Text type="secondary">{` live · ${seg.slot.patient}`}</Text>
        <Segmented size="small" value="interactive" onChange={(v) => setMode(seg.slot.key, v)} options={[{ value: "interactive", label: "Interactive" }, { value: "pdf", label: "PDF" }]} />
      </div>
      <React.Suspense fallback={<Text type="secondary">Loading the interactive panel…</Text>}>
        {tokens === "loading" ? <Text type="secondary">Loading the figure style…</Text> : <InteractiveSlot patient={seg.slot.patient} {...sidecarExtras(sidecar, seg.slot.patient)} />}
      </React.Suspense>
    </div>
  );
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
      {segments.map((seg) => (seg.type === "svg" ? renderSheet(seg.y0, seg.y1) : renderSlot(seg)))}
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
              {panelTables(sidecar, p.letter).length > 0 && (
                <Button type="link" size="small" onClick={() => setOpen({ panel: p, tab: "data" })}>
                  data
                </Button>
              )}
              {t && (
                <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openPaperTarget(t)}>
                  {targetLabel(t)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {patientOpen && (
        <React.Suspense fallback={null}>
          <PatientDrawer patient={patientOpen} onClose={() => setPatientOpen(null)} />
        </React.Suspense>
      )}
      <PanelModal fig={fig} panel={open?.panel || open} initialTab={open?.tab || "panel"} tables={open ? panelTables(sidecar, (open.panel || open).letter) : []} onClose={() => setOpen(null)} onOpenTarget={openPaperTarget} />
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
