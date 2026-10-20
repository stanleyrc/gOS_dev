import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Empty, Modal, Space, Tag, Typography } from "antd";
import { DownloadOutlined, ExpandOutlined, LinkOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "../cohort/useCohortExport";
import { PAPER_FIGURES_DIR, PAPER_MANIFEST_FILE, anchoredPanels, bestImage, formatBuilt, panelAt, panelRegions, panelTarget, parsePaperManifest, targetSearch } from "../../../helpers/singleCell/paperManifest";
import { announceCohortView, requestHelpTarget } from "../../../helpers/singleCell/helpNav";
import { PanelModal, STATUS_TAG_COLOR, ZoomPanImage, targetLabel } from "./paperFiguresViewer";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import CnZoomLayer from "./cnZoomLayer";
import { highlightRects, hitAt, markPositions, panelTables, parseSidecar, plotHitAt, rowsBetween, sidecarExtras } from "../../../helpers/singleCell/paperSidecar";
import { applyPaperTokens, paperTokensVersion } from "../../../helpers/singleCell/paperPalette";
import { encodeGroups } from "../../../helpers/singleCell/savedGroups";

const InteractiveSlot = React.lazy(() => import("./interactiveSlot"));
const SelectionDrawer = React.lazy(() => import("./selectionDrawer"));
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
 * One manuscript figure as its own page, exactly as in the PDF: every panel at its PDF position and size (the exact
 * SVG; schematics stay vector), with an interactive layer on top of each data panel, styled as the figure:
 * - hover: cell rows (tree / heatmap / strips), plot points and tiles show their data;
 * - click / drag (shift adds): select cells, brushed across every panel of the patient in this figure;
 * - CN heatmaps zoom in place (wheel / drag, redrawn from the 100 kb bins in the figure's CN scale);
 * - walks of the figure (chips) select their carrier cells;
 * - drawers: the selected cells, a patient summary (cohort panels), each panel's data table, open-in-gOS links.
 * The generic gOS patient figure is one explicit action away ("Open in patient view"), never the default.
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
  const [patientView, setPatientView] = useState(null); // explicit "Open in patient view" (generic gOS patient figure)
  const anchors = useMemo(() => anchoredPanels(fig), [fig]);
  const regions = useMemo(() => (fig?.widthPt ? panelRegions(anchors, fig.widthPt, fig.heightPt) : []), [anchors, fig]);
  // first paint = the SVG; the interaction layer (sidecar, tokens) loads after the image
  const [imgReady, setImgReady] = useState(false);
  useEffect(() => setImgReady(false), [fig?.id]);
  const [sidecar, setSidecar] = useState(null);
  useEffect(() => {
    setSidecar(null);
    if (!fig?.interactive || !imgReady) return undefined;
    let live = true;
    tryGet(fig.interactive).then((r) => live && setSidecar(r.status === "ok" ? parseSidecar(r.data) : null));
    return () => {
      live = false;
    };
  }, [fig?.interactive, imgReady]);
  const [tokens, setTokens] = useState("loading");
  useEffect(() => {
    if (!manifest) return undefined;
    if (!manifest.styleTokens) {
      setTokens("none");
      return undefined;
    }
    let live = true;
    tryGet(manifest.styleTokens).then((r) => live && setTokens(r.status === "ok" && applyPaperTokens(r.data) ? `v${paperTokensVersion()}` : "none"));
    return () => {
      live = false;
    };
  }, [manifest]);
  const [hit, setHit] = useState(null);
  const [plotHit, setPlotHit] = useState(null);
  const [patientOpen, setPatientOpen] = useState(null);
  const [sel, setSel] = useState(null); // { ids: Set, patient, label }
  const [cellsOpen, setCellsOpen] = useState(false);
  const brush = useRef(null);
  const [brushBox, setBrushBox] = useState(null);
  const [cnZoom, setCnZoom] = useState({}); // region id -> { from, to } | true (opened at the panel's own range)
  useEffect(() => {
    setSel(null);
    setCnZoom({});
    setPatientOpen(null);
  }, [label]);
  // walks of the figure (sidecar data) -> carrier cells from the patient's walks.json
  const extras = useMemo(() => (sidecar ? sidecarExtras(sidecar, sidecar.data?.walk_names?.patient || sidecar.data?.ecdna_snvs?.patient) : {}), [sidecar]);
  const walkPatient = sidecar?.data?.walk_names?.patient || null;
  const dataset = useSelector((s) => s.Settings?.dataset);
  const [walks, setWalks] = useState(null);
  useEffect(() => {
    setWalks(null);
    if (!walkPatient || !dataset?.dataPath) return undefined;
    let live = true;
    tryGet(casePath(dataset, walkPatient, "walks.json")).then((r) => live && setWalks(r.status === "ok" ? r.data?.walks || [] : null));
    return () => {
      live = false;
    };
  }, [walkPatient, dataset]);
  const sheetRef = useRef(null);
  // wheel over a CN heatmap region opens its zoom layer (the layer then handles the wheel itself)
  const zoomRegionAt = (x, y) => sidecar?.regions.find((r) => r.kind === "rows" && r.axis?.type === "genome" && r.patient && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const kRef = useRef(1);
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !sidecar) return undefined;
    const onWheel = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / kRef.current;
      const y = (e.clientY - r.top) / kRef.current;
      const reg = zoomRegionAt(x, y);
      if (!reg) return;
      e.preventDefault();
      setCnZoom((z) => (z[reg.id] ? z : { ...z, [reg.id]: true }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [sidecar]); // eslint-disable-line react-hooks/exhaustive-deps
  if (status === "loading") return <Text type="secondary">Loading the paper figures…</Text>;
  if (!manifest) return <Empty description="not available (paper figures not synced: srctools inst/paper_figures/sync_gos.sh)" />;
  if (!fig) return <Empty description={`not available (${label} is not in the synced figures)`} />;
  const natW = (fig.widthPt || 600) * PT_PX;
  const width = Math.max(320, Math.min(measured, Math.round(natW * 1.9)));
  const k = width / (fig.widthPt || 600); // px per pt
  kRef.current = k;
  const height = (fig.heightPt || 600) * k;
  const at = (e) => {
    const r = sheetRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k, e.clientX - r.left, e.clientY - r.top];
  };
  const region = hover ? regions.find((b) => b.letter === hover.letter) : null;
  const patients = [...new Set((sidecar?.regions || []).map((r) => r.patient).filter(Boolean))];
  const selectIds = (ids, patient, lbl, add) => {
    const keep = add && sel && sel.patient === patient ? [...sel.ids] : [];
    const next = new Set([...keep, ...ids.map(String)]);
    setSel(next.size ? { ids: next, patient, label: lbl } : null);
  };
  const zoomWin = (id) => (cnZoom[id] && cnZoom[id] !== true ? cnZoom[id] : null);
  const hitPos = (h, x) => {
    if (!h?.region.axis || h.region.axis.type !== "genome") return h?.position || null;
    const w = zoomWin(h.region.id);
    if (!w) return h.position;
    const t = (x - h.region.x) / h.region.w;
    return { chr: `${h.region.axis.chr}`, pos: Math.round(w.from + t * (w.to - w.from)) };
  };
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
      {extras.walkNames && walks && (
        <div className="sc-paperpage-walks">
          <Text type="secondary" style={{ fontSize: 12 }}>{`${walkPatient} walks: `}</Text>
          {Object.entries(extras.walkNames).map(([lab, name]) => {
            const w = walks.find((x) => `${x.label}` === lab);
            if (!w) return null;
            const carriers = Object.entries(w.cells || {})
              .filter(([, v]) => (Number(v) || 0) >= 1)
              .map(([c]) => c);
            const on = sel?.label === name;
            return (
              <Tag.CheckableTag key={lab} checked={on} onChange={() => (on ? setSel(null) : selectIds(carriers, walkPatient, name, false))} style={{ borderColor: extras.walkColors?.[lab], color: on ? undefined : extras.walkColors?.[lab] }}>
                {`${name} (${carriers.length})`}
              </Tag.CheckableTag>
            );
          })}
        </div>
      )}
      {sel && (
        <div className="sc-paperpage-selbar">
          <b>{`${sel.ids.size} cell${sel.ids.size === 1 ? "" : "s"} selected`}</b>
          <Text type="secondary">{` · ${sel.label || "selection"}${sel.patient ? ` · ${sel.patient}` : ""} · highlighted in every panel of the figure`}</Text>
          <Button size="small" type="primary" onClick={() => setCellsOpen(true)}>
            Cells
          </Button>
          {sel.patient && (
            <Button size="small" href={cellsUrl(sel.patient, [...sel.ids], `${fig.label} selection`)} target="_blank" rel="noopener noreferrer">
              {`Open in ${sel.patient}`}
            </Button>
          )}
          <Button size="small" onClick={() => setSel(null)}>
            Clear
          </Button>
        </div>
      )}
      <div
        ref={sheetRef}
        className="sc-paperpage-sheet"
        style={{ position: "relative", width, height, cursor: hit ? "crosshair" : hover || plotHit?.fields ? "pointer" : "default", touchAction: "none", userSelect: "none" }}
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
          setHit(h ? { ...h, position: hitPos(h, x) } : null);
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
          if (ids.length) selectIds(ids, r.patient, b.moved ? `${ids.length} rows of ${fig.label}${r.panel || ""}` : ids[0], e.shiftKey);
        }}
        onMouseLeave={() => {
          setHover(null);
          setTip(null);
          setHit(null);
          setPlotHit(null);
        }}
        onClick={(e) => {
          const [x, y] = at(e);
          if (hitAt(sidecar, x, y)) return; // rows: handled as a selection
          const ph = plotHitAt(sidecar, x, y);
          const cell = ph?.fields?.cell || ph?.fields?.cell_id;
          if (cell) {
            selectIds([`${cell}`], ph.fields.patient || ph.region.patient || sel?.patient || null, `${cell}`, e.shiftKey);
            return;
          }
          if (ph?.fields?.patient) {
            setPatientOpen({ patient: `${ph.fields.patient}`, fields: ph.fields, panel: `${fig.label}${ph.region.panel || ""}` });
            return;
          }
          const p = panelAt(anchors, x, y);
          if (p) setOpen(p);
        }}
      >
        <img src={bestImage(fig)} alt={`${fig.label}: ${fig.title}`} draggable={false} onLoad={() => setImgReady(true)} style={{ width, height, display: "block", userSelect: "none" }} />
        {sidecar &&
          Object.keys(cnZoom).map((id) => {
            const reg = sidecar.regions.find((r) => r.id === id);
            return reg ? (
              <CnZoomLayer
                key={`z${id}`}
                region={reg}
                k={k}
                win={zoomWin(id)}
                onWindow={(w) => setCnZoom((z) => ({ ...z, [id]: w }))}
                onClose={() =>
                  setCnZoom((z) => {
                    const n = { ...z };
                    delete n[id];
                    return n;
                  })
                }
              />
            ) : null;
          })}
        {sel &&
          (() => {
            const lm = linkedMarks(sidecar, sel.ids);
            return [
              ...lm.rects.map((r, i) => <div key={`s${i}`} className="sc-paperpage-sel" style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: Math.max(1.5, r.h * k) }} />),
              ...lm.rings.map(([x, y], i) => <div key={`sr${i}`} className="sc-paperpage-ring is-sel" style={{ left: x * k - 5, top: y * k - 5 }} />),
            ];
          })()}
        {hit &&
          linkedMarks(sidecar, new Set([hit.id])).rects.map((r, i) => (
            <div key={`h${i}`} className="sc-paperpage-hover" style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: Math.max(2, r.h * k) }} />
          ))}
        {plotHit?.page && <div className="sc-paperpage-ring" style={{ left: plotHit.page[0] * k - 6, top: plotHit.page[1] * k - 6, width: 12, height: 12 }} />}
        {plotHit?.rect && <div className="sc-paperpage-hover" style={{ left: plotHit.rect.x * k, top: plotHit.rect.y * k, width: Math.max(2, plotHit.rect.w * k), height: Math.max(2, plotHit.rect.h * k), background: "transparent", outline: "2px solid #fa8c16" }} />}
        {plotHit?.fields?.cell &&
          linkedMarks(sidecar, new Set([`${plotHit.fields.cell}`])).rects.map((r, i) => (
            <div key={`l${i}`} className="sc-paperpage-hover" style={{ left: r.x * k, top: r.y * k, width: r.w * k, height: Math.max(2, r.h * k) }} />
          ))}
        {brushBox && <div className="sc-paperpage-brush" style={{ left: brushBox.x * k, top: brushBox.y0 * k, width: brushBox.w * k, height: (brushBox.y1 - brushBox.y0) * k }} />}
        {region && !hit && !plotHit?.fields && (
          <div className="sc-paperpage-region" style={{ left: region.x0 * k, top: region.y0 * k, width: (region.x1 - region.x0) * k, height: (region.y1 - region.y0) * k }} />
        )}
        {hit && tip && (
          <div className="sc-tooltip" style={{ position: "absolute", left: Math.min(tip.px + 14, width - 280), top: tip.py + 14, maxWidth: 280, pointerEvents: "none", zIndex: 6 }}>
            <div style={{ fontWeight: 600 }}>{hit.id}</div>
            <div>{`${fig.label}${hit.region.panel || ""} · ${hit.region.label}${hit.region.patient ? ` · ${hit.region.patient}` : ""}`}</div>
            {hit.extras.map((x) => (
              <div key={x.label}>{`${x.label}: ${fmtVal(x.value)}`}</div>
            ))}
            {hit.position && <div>{`chr${hit.position.chr}:${hit.position.pos.toLocaleString()}`}</div>}
            <div style={{ opacity: 0.8 }}>{`click to select · drag rows · shift adds${zoomRegionAt(hit.region.x + 0.1, hit.region.y + 0.1) && !cnZoom[hit.region.id] ? " · wheel to zoom the CN" : ""}`}</div>
          </div>
        )}
        {plotHit && tip && !hit && (
          <div className="sc-tooltip" style={{ position: "absolute", left: Math.min(tip.px + 14, width - 280), top: tip.py + 14, maxWidth: 280, pointerEvents: "none", zIndex: 6 }}>
            <div style={{ fontWeight: 600 }}>{plotHit.fields ? plotHit.fields.cell || plotHit.fields.patient || plotHit.fields.gene || plotHit.fields.row || plotHit.fields.label || `${fig.label}${plotHit.region.panel || ""}` : `${fig.label}${plotHit.region.panel || ""}`}</div>
            {plotHit.fields &&
              Object.entries(plotHit.fields)
                .filter(([key]) => key !== "cell")
                .map(([key, v]) => <div key={key}>{`${key}: ${fmtVal(v)}`}</div>)}
            {plotHit.axis && <div>{`x: ${plotHit.axis.x == null ? "–" : fmtVal(plotHit.axis.x)} · y: ${plotHit.axis.y == null ? "–" : fmtVal(plotHit.axis.y)}`}</div>}
            <div style={{ opacity: 0.8 }}>{plotHit.fields?.cell ? "click to select (shift adds)" : plotHit.fields?.patient ? "click for the patient summary" : "click: open the panel"}</div>
          </div>
        )}
        {hover && tip && !hit && !plotHit && (
          <div className="sc-tooltip" style={{ position: "absolute", left: Math.min(tip.px + 14, width - 280), top: tip.py + 14, maxWidth: 280, pointerEvents: "none", zIndex: 6 }}>
            <div style={{ fontWeight: 600 }}>{`${fig.label}${hover.letter}`}</div>
            <div>{hover.status}</div>
            {hover.reason && <div style={{ opacity: 0.8 }}>{hover.reason.length > 160 ? `${hover.reason.slice(0, 160)}…` : hover.reason}</div>}
            <div style={{ opacity: 0.8 }}>click: open large, data table and links</div>
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
              {panelTables(sidecar, p.letter).length > 0 && (
                <Button type="link" size="small" onClick={() => setOpen({ panel: p, tab: "data" })}>
                  data
                </Button>
              )}
              {p.view?.panel === "patient-figure" && p.view.patient && (
                <Button type="link" size="small" onClick={() => setPatientView(p.view.patient)}>
                  {`Open in patient view (${p.view.patient})`}
                </Button>
              )}
              {t && t.kind !== "interactive" && (
                <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openPaperTarget(t)}>
                  {targetLabel(t)}
                </Button>
              )}
            </div>
          );
        })}
        {!patients.length && !sidecar && imgReady && <Text type="secondary" style={{ fontSize: 12 }}>This figure has no interactive data layer yet: hover a panel and click to open it large.</Text>}
      </div>
      {cellsOpen && sel && (
        <React.Suspense fallback={null}>
          <SelectionDrawer ids={[...sel.ids]} patient={sel.patient} label={sel.label} sidecar={sidecar} figLabel={fig.label} onClose={() => setCellsOpen(false)} />
        </React.Suspense>
      )}
      {patientOpen && (
        <React.Suspense fallback={null}>
          <PatientDrawer patient={patientOpen.patient} focus={patientOpen} onClose={() => setPatientOpen(null)} />
        </React.Suspense>
      )}
      <PanelModal
        fig={fig}
        panel={open?.panel || open}
        initialTab={open?.tab || "panel"}
        tables={open ? panelTables(sidecar, (open.panel || open).letter) : []}
        onClose={() => setOpen(null)}
        onOpenTarget={(t) => (t.kind === "interactive" && t.panel === "patient-figure" && t.patient ? setPatientView(t.patient) : openPaperTarget(t))}
      />
      <Modal open={!!patientView} onCancel={() => setPatientView(null)} footer={null} width="96vw" title={`${patientView || ""} · patient view (gOS components; the figure stays as in the PDF)`} destroyOnClose>
        {patientView && (
          <React.Suspense fallback={<Text type="secondary">Loading…</Text>}>
            {tokens === "loading" ? <Text type="secondary">Loading the figure style…</Text> : <InteractiveSlot patient={patientView} {...sidecarExtras(sidecar, patientView)} />}
          </React.Suspense>
        )}
      </Modal>
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
