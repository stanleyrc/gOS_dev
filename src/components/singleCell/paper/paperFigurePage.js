import React, { useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Empty, Modal, Space, Tag, Typography } from "antd";
import { DownloadOutlined, ExpandOutlined, LinkOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "../cohort/useCohortExport";
import { PAPER_FIGURES_DIR, PAPER_MANIFEST_FILE, anchoredPanels, bestImage, formatBuilt, panelAt, panelRegions, panelTarget, parsePaperManifest, targetSearch } from "../../../helpers/singleCell/paperManifest";
import { announceCohortView, requestHelpTarget } from "../../../helpers/singleCell/helpNav";
import { PanelModal, STATUS_TAG_COLOR, ZoomPanImage, targetLabel } from "./paperFiguresViewer";

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
      <div
        ref={pageRef}
        className="sc-paperpage-sheet"
        style={{ position: "relative", width, height, cursor: hover ? "pointer" : "default" }}
        onMouseMove={(e) => {
          const [x, y, px, py] = at(e);
          const p = panelAt(anchors, x, y);
          setHover(p);
          setTip(p ? { px, py } : null);
        }}
        onMouseLeave={() => {
          setHover(null);
          setTip(null);
        }}
        onClick={(e) => {
          const [x, y] = at(e);
          const p = panelAt(anchors, x, y);
          if (p) setOpen(p);
        }}
      >
        <img src={bestImage(fig)} alt={`${fig.label}: ${fig.title}`} draggable={false} style={{ width, height, display: "block", userSelect: "none" }} />
        {region && (
          <div
            className="sc-paperpage-region"
            style={{ left: region.x0 * k, top: region.y0 * k, width: (region.x1 - region.x0) * k, height: (region.y1 - region.y0) * k }}
          />
        )}
        {hover && tip && (
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
