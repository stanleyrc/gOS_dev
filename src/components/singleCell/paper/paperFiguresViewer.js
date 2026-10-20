import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Modal, Segmented, Space, Tag, Tooltip, Typography } from "antd";
import { CompressOutlined, DownloadOutlined, LinkOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import PanelDataTable from "./panelDataTable";
import { bestImage, fitView, formatBuilt, panelTarget, zoomAt } from "../../../helpers/singleCell/paperManifest";

const { Text } = Typography;
const STATUS_COLOR = { ready: "green", partial: "orange", "not available": "default" };
const PT_PX = 96 / 72; // figure size in CSS px at 100 %

/**
 * Zoomable, pannable view of one image (the exact SVG of a figure or panel):
 * wheel to zoom about the cursor, drag to pan, buttons for zoom / fit.
 * width / height: the image's natural size in CSS px.
 */
export function ZoomPanImage({ src, alt, width, height, viewHeight = 640 }) {
  const box = useRef(null);
  const [vw, setVw] = useState(800);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef(null);
  const fit = useCallback(() => setView(fitView(width, height, box.current?.clientWidth || vw, viewHeight)), [width, height, vw, viewHeight]);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    setVw(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => fit(), [src, vw]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const zoomBy = (f) => setView((v) => zoomAt(v, f, (box.current?.clientWidth || vw) / 2, viewHeight / 2));
  return (
    <div className="sc-paper-zoom">
      <Space size={4} className="sc-paper-zoom-tools">
        <Tooltip title="Zoom in">
          <Button size="small" icon={<ZoomInOutlined />} onClick={() => zoomBy(1.4)} />
        </Tooltip>
        <Tooltip title="Zoom out">
          <Button size="small" icon={<ZoomOutOutlined />} onClick={() => zoomBy(1 / 1.4)} />
        </Tooltip>
        <Tooltip title="Fit">
          <Button size="small" icon={<CompressOutlined />} onClick={fit} />
        </Tooltip>
        <Text type="secondary" style={{ fontSize: 12 }}>{`${Math.round(view.k * 100)}% · scroll to zoom, drag to pan`}</Text>
      </Space>
      <div
        ref={box}
        style={{ position: "relative", overflow: "hidden", height: viewHeight, cursor: drag.current ? "grabbing" : "grab", background: "#fff", border: "1px solid var(--sc-border, #e5e5e5)", borderRadius: 4, touchAction: "none" }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, v: view };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setView({ ...d.v, x: d.v.x + e.clientX - d.x, y: d.v.y + e.clientY - d.y });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={fit}
      >
        {/* an <img> keeps the SVG vector-sharp at every zoom and isolates its styles from the page */}
        <img src={src} alt={alt} draggable={false} style={{ position: "absolute", left: 0, top: 0, width, height, transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, userSelect: "none", maxWidth: "none" }} />
      </div>
    </div>
  );
}

function PanelCard({ fig, panel, onOpen }) {
  const img = bestImage(panel);
  return (
    <div className="sc-paper-panel" role="button" tabIndex={0} onClick={() => onOpen(panel)} onKeyDown={(e) => e.key === "Enter" && onOpen(panel)}>
      <div className="sc-paper-panel-thumb">{img ? <img src={img} alt={`${fig.label}${panel.letter}`} loading="lazy" /> : <Text type="secondary">no panel file</Text>}</div>
      <div className="sc-paper-panel-meta">
        <b>{panel.letter}</b>
        <Tag color={STATUS_COLOR[panel.status] || "default"} style={{ marginInlineEnd: 0 }}>
          {panel.status}
        </Tag>
        {panel.view && <LinkOutlined title="has an interactive view" />}
      </div>
    </div>
  );
}

/**
 * "Paper figures" mode: the built manuscript figures exactly as the figure
 * scripts made them (SVG, zoom / pan), a panel strip with each panel's build
 * status, a large panel view, PDF download and the link from each panel to
 * its interactive view. manifest: parsePaperManifest output; onOpenTarget(target)
 * opens a panel's interactive counterpart (panelTarget).
 */
export default function PaperFiguresViewer({ manifest, initialFigure = null, onOpenTarget }) {
  const groups = useMemo(() => {
    const g = { main: [], supplementary: [], extra: [] };
    (manifest?.figures || []).forEach((f) => g[f.group].push(f));
    return g;
  }, [manifest]);
  const [figId, setFigId] = useState(initialFigure && manifest?.figures.some((f) => f.id === initialFigure) ? initialFigure : manifest?.figures[0]?.id || null);
  const fig = manifest?.figures.find((f) => f.id === figId) || manifest?.figures[0] || null;
  const [panel, setPanel] = useState(null);
  if (!manifest || !fig) return <Empty description="not available (paper figures not synced: srctools inst/paper_figures/sync_gos.sh)" />;
  const w = (fig.widthPt || 600) * PT_PX;
  const h = (fig.heightPt || 600) * PT_PX;
  const option = (f) => ({ value: f.id, label: <Tooltip title={f.title}>{f.label}{f.nIncomplete ? <span className="sc-paper-dot" /> : null}</Tooltip> });
  return (
    <div className="sc-paper">
      <div className="sc-paper-bar">
        <Space wrap size={[12, 6]}>
          <Segmented size="small" value={fig.id} onChange={(v) => { setFigId(v); setPanel(null); }} options={groups.main.map(option)} />
          {groups.supplementary.length > 0 && <Segmented size="small" value={fig.group === "supplementary" ? fig.id : null} onChange={setFigId} options={groups.supplementary.map(option)} />}
          {groups.extra.length > 0 && <Segmented size="small" value={fig.group === "extra" ? fig.id : null} onChange={setFigId} options={groups.extra.map(option)} />}
        </Space>
        <Space size={10} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {`Built ${formatBuilt(fig.built)} · synced ${formatBuilt(manifest.synced)}${manifest.srctools?.sha ? ` · srctools ${manifest.srctools.sha}${manifest.srctools.uncommitted_changes ? " (+ uncommitted)" : ""}` : ""}`}
          </Text>
          {fig.pdf && (
            <Button size="small" icon={<DownloadOutlined />} href={fig.pdf} target="_blank" rel="noopener noreferrer">
              PDF
            </Button>
          )}
        </Space>
      </div>
      <div className="sc-paper-title">
        <b>{fig.label}</b> {fig.title}
        {fig.nIncomplete > 0 && <Text type="warning" style={{ marginLeft: 8, fontSize: 12 }}>{`${fig.nIncomplete} panel${fig.nIncomplete > 1 ? "s" : ""} partial or not available`}</Text>}
      </div>
      <ZoomPanImage src={bestImage(fig)} alt={`${fig.label}: ${fig.title}`} width={w} height={h} viewHeight={Math.min(900, Math.max(520, h + 20))} />
      {fig.panels.length > 0 && (
        <>
          <div className="sc-paper-subhead">Panels · click to open large{fig.panels.some((p) => p.view) ? " · linked panels open their interactive view" : ""}</div>
          <div className="sc-paper-panels">
            {fig.panels.map((p) => (
              <PanelCard key={p.letter} fig={fig} panel={p} onOpen={setPanel} />
            ))}
          </div>
        </>
      )}
      <PanelModal fig={fig} panel={panel} onClose={() => setPanel(null)} onOpenTarget={onOpenTarget} />
    </div>
  );
}

function PanelLarge({ panel }) {
  // natural size from the image itself, then fitted into the modal by ZoomPanImage
  const [size, setSize] = useState(null);
  const src = bestImage(panel);
  useEffect(() => {
    setSize(null);
    const im = new Image();
    im.onload = () => setSize({ w: im.naturalWidth || 800, h: im.naturalHeight || 600 });
    im.src = src;
  }, [src]);
  if (!size) return <Text type="secondary">Loading…</Text>;
  return <ZoomPanImage src={src} alt={`panel ${panel.letter}`} width={size.w} height={size.h} viewHeight={Math.min(720, Math.max(360, (window.innerHeight || 900) - 300))} />;
}

/** A panel opened large: the exact panel image (zoom / pan), its build status and notes, panel PDF, link to its interactive view. */
export function PanelModal({ fig, panel, onClose, onOpenTarget, tables = [], initialTab = "panel" }) {
  const target = panel ? panelTarget(panel.view) : null;
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [panel, initialTab]);
  return (
    <Modal
      open={!!panel}
      onCancel={onClose}
      width="min(1200px, 96vw)"
      title={panel && fig ? `${fig.label}${panel.letter} · ${fig.title}` : ""}
      footer={
        panel ? (
          <Space>
            {panel.pdf && (
              <Button icon={<DownloadOutlined />} href={panel.pdf} target="_blank" rel="noopener noreferrer">
                Panel PDF
              </Button>
            )}
            {target && (
              <Button type="primary" icon={<LinkOutlined />} onClick={() => { onClose(); onOpenTarget?.(target); }}>
                {targetLabel(target)}
              </Button>
            )}
          </Space>
        ) : null
      }
    >
      {panel && (
        <>
          {tables.length > 0 && <Segmented size="small" value={tab} onChange={setTab} options={[{ value: "panel", label: "Panel" }, { value: "data", label: `Data (${tables.length})` }]} style={{ marginBottom: 8 }} />}
          {tab === "data" && tables.length > 0 ? (
            <PanelDataTable tables={tables} name={`${fig?.id || "figure"}_${panel.letter}`} />
          ) : bestImage(panel) ? (
            <PanelLarge panel={panel} />
          ) : (
            <Empty description="No separate panel file: it is shown in the whole figure." />
          )}
          <div style={{ marginTop: 8 }}>
            <Tag color={STATUS_COLOR[panel.status] || "default"}>{panel.status}</Tag>
            <Text style={{ fontSize: 12 }}>{panel.reason || "no notes"}</Text>
            {panel.source && <div><Text type="secondary" style={{ fontSize: 12 }}>{`Source: ${panel.source}`}</Text></div>}
          </div>
        </>
      )}
    </Modal>
  );
}

/** Button text for a panel's interactive target. */
export function targetLabel(target) {
  if (!target) return "";
  if (target.label) return target.label;
  if (target.kind === "interactive") return `Interactive view${target.patient ? ` (${target.patient})` : ""}`;
  if (target.kind === "scview") return `Open the ${target.scview} view`;
  return `Open ${target.patient}`;
}

export const STATUS_TAG_COLOR = STATUS_COLOR;
