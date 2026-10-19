import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as d3 from "d3";
import { Segmented, Typography } from "antd";
import settingsActions from "../../redux/settings/actions";
import usePlotTheme from "../singleCell/usePlotTheme";
import SvgExportButton from "../singleCell/svgExportButton";
import { TYPE, FONT_FAMILY } from "../../helpers/singleCell/plotTheme";
import { priorityGenesMemo } from "../../helpers/singleCell/priorityGenes";
import { externalLinks } from "../../helpers/singleCell/externalLinks";
import { measureText } from "../../helpers/utility";
import {
  geneClass, transcriptSegments, transcriptIntrons, exonInfo, arrowGenesInWindow, chromosomesInWindow,
} from "../../helpers/genes/geneModels";
import {
  GEOMETRY, trackView, densityBins, layoutCollapsed, layoutIsoforms, placeLabels, trackHeight, chevronPositions, visibleSpan,
} from "../../helpers/genes/trackLayout";
import { useGeneModels, useGeneMode } from "./useGeneModels";

const { Text } = Typography;
const fmt = d3.format(",");
const LABEL_PX = TYPE.tick;
const measure = (s) => measureText(s, LABEL_PX) + 2;
const MODE_OPTIONS = [
  { value: "collapsed", label: "Collapsed" },
  { value: "squished", label: "Squished" },
  { value: "expanded", label: "Expanded" },
];

function colours(theme) {
  const dark = theme.mode === "dark";
  return {
    coding: dark ? "#6fa8ff" : "#1d4f91",
    noncoding: dark ? "#5fcf8a" : "#2b8a4b",
    pseudo: theme.faint,
    priority: theme.danger,
    hover: theme.hover,
    line: theme.axis,
    density: dark ? "#6fa8ff" : "#1d4f91",
  };
}

/** Place of a gene-local position. */
const P = (g, pos) => g.offset + pos;

/** Hover location line (own subscription so the track does not re-render on every mouse move). */
const HoverMark = memo(function HoverMark({ panels, height }) {
  const loc = useSelector((s) => s.Settings.hoveredLocation);
  const idx = useSelector((s) => s.Settings.hoveredLocationPanelIndex);
  const theme = usePlotTheme();
  const panel = panels[idx];
  if (!panel || !Number.isFinite(loc)) return null;
  const xx = panel.x(loc);
  if (!(xx >= 0 && xx <= panel.width)) return null;
  return (
    <line x1={panel.offset + xx} x2={panel.offset + xx} y1={0} y2={height} stroke={theme.hover} strokeWidth={1.2} strokeDasharray="5,5" pointerEvents="none" />
  );
});

function Chevrons({ a, b, y, strand, color, h = 3 }) {
  const dir = strand === "-" ? -1 : 1;
  return chevronPositions(a, b).map((cx) => (
    <polyline key={cx} points={`${cx - dir * h},${y - h} ${cx},${y} ${cx - dir * h},${y + h}`} fill="none" stroke={color} strokeWidth={1} />
  ));
}

/** One transcript (or a collapsed gene) drawn as UCSC does: intron line with chevrons, thin UTR, thick CDS. */
function Model({ x, width, gene, segments, introns, span, y, geo, color, chevrons, onExon }) {
  if (!span) return null;
  const parts = segments
    .map((s, k) => {
      const v = visibleSpan(x, P(gene, s.start), P(gene, s.end) + 1, width);
      if (!v) return null;
      const h = s.kind === "cds" ? geo.cds : geo.utr;
      return (
        <rect key={k} x={v[0]} y={y - h / 2} width={Math.max(1, v[1] - v[0])} height={h} fill={color}
          onMouseMove={onExon ? (e) => onExon(e, s) : undefined} />
      );
    })
    .filter(Boolean);
  return (
    <g>
      <line x1={span[0]} x2={span[1]} y1={y} y2={y} stroke={color} strokeWidth={1} />
      {chevrons && (introns || []).map((it, k) => {
        const v = visibleSpan(x, P(gene, it.start), P(gene, it.end) + 1, width);
        return v ? <Chevrons key={k} a={v[0]} b={v[1]} y={y} strand={gene.strand} color={color} /> : null;
      })}
      {chevrons && !introns && segments.length === 0 && <Chevrons a={span[0]} b={span[1]} y={y} strand={gene.strand} color={color} />}
      {parts}
    </g>
  );
}

function clampDomain(domains, index, selection) {
  const others = domains.filter((d, i) => i !== index);
  const sel = [...selection];
  const lower = d3.max(others.filter((d) => d[0] <= sel[0] && sel[0] <= d[1]).map((d) => d[1]));
  const upper = d3.min(others.filter((d) => d[1] >= sel[0] && sel[1] <= d[1]).map((d) => d[0]));
  if (upper !== undefined && sel[1] >= upper) {
    sel[1] = upper;
    sel[0] = Math.min(sel[0], upper - 1);
  }
  if (lower !== undefined && sel[0] <= lower) {
    sel[0] = lower;
    sel[1] = Math.max(sel[1], lower + 1);
  }
  return sel;
}

/**
 * Gene track for genome windows: collapsed (one model per gene, labels never overlapping), squished (every
 * isoform as a thin packed row) and expanded (every isoform with its name, canonical first). Windows <= 20 Mb
 * draw transcript models (genes/hg38_models/chr<N>.json, loaded per chromosome on demand); larger windows draw
 * gene bodies from the gene table under a gene-density strip; above 15% of the genome only the density and the
 * priority genes (GBM core + the patient's drivers) are shown. Drag / wheel pans and zooms the shared domains
 * like the other gOS tracks; click a gene to zoom to it, shift-click to call `onGeneShiftClick(name)`.
 *
 * Props: width (px, including the 2 x gapX margins), domains (default: the shared Settings domains), gapX (left /
 * right margin, 50 to line up with the other tracks; gapRight overrides the right one), showControls, mode / onModeChange (controlled; default the
 * shared `genemode` URL value), priorityGenes (override), exportName, hoverLine, maxHeight (collapsed-mode height
 * budget of a fixed-height host: rows that do not fit are left unlabelled, never cut), onHeightChange(px incl. controls),
 * interactive (false: no pan / zoom / click-zoom, for fixed windows such as the driver locus plots).
 */
export default function GeneTrack({
  width, domains: domainsProp, gapX = 50, gapRight = null, showControls = true, mode: modeProp, onModeChange, priorityGenes: prioProp,
  onGeneShiftClick, exportName = "genes", hoverLine = true, maxHeight = null, interactive = true, onHeightChange = null,
}) {
  const dispatch = useDispatch();
  const theme = usePlotTheme();
  const col = useMemo(() => colours(theme), [theme]);
  const settings = useSelector((s) => s.Settings);
  const store = useSelector((s) => s.Genes);
  const prioStore = useSelector((s) => (s.SingleCell?.patient != null ? priorityGenesMemo(s.FilteredEvents?.originalFilteredEvents || s.FilteredEvents?.filteredEvents) : null));
  const { chromoBins, defaultDomain, zoomedByCmd } = settings;
  const reference = settings.dataset?.reference || "hg38";
  const domains = domainsProp || settings.domains || [];
  const [urlMode, setUrlMode] = useGeneMode();
  const mode = modeProp || urlMode;
  const setMode = onModeChange || setUrlMode;
  const priority = useMemo(() => {
    const list = prioProp || prioStore;
    return list && list.length ? new Set(list) : null;
  }, [prioProp, prioStore]);
  const genomeSpan = defaultDomain ? Math.abs(defaultDomain[1] - defaultDomain[0]) : 0;
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const panelRefs = useRef([]);
  const [hover, setHover] = useState(null);
  const hideTimer = useRef(null);
  const uid = useRef(`gt${Math.random().toString(36).slice(2, 9)}`).current;

  const right = gapRight == null ? gapX : gapRight;
  const stageWidth = Math.max(10, width - gapX - right);
  const panelWidth = (stageWidth - (domains.length - 1) * gapX) / Math.max(1, domains.length);

  // chromosomes needing models: windows of <= 20 Mb
  const views = domains.map((d) => trackView(d[0], d[1], genomeSpan));
  const needed = useMemo(() => {
    const m = new Map();
    domains.forEach((d, i) => {
      if (views[i] !== "models") return;
      chromosomesInWindow(chromoBins, d[0], d[1]).forEach((c) => m.set(c.chromosome, c));
    });
    return [...m.values()].filter((c) => /^([0-9]+|X|Y|M)$/.test(c.chromosome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains.toString(), chromoBins, genomeSpan]);
  const models = useGeneModels(needed, reference);

  // a fixed-height host (maxHeight) gets as many collapsed rows as fit, never a row cut in half
  const fitRows = (extra) => (maxHeight
    ? Math.max(1, Math.min(GEOMETRY.collapsed.maxRows, Math.floor((maxHeight - extra - GEOMETRY.collapsed.labelH - 8) / GEOMETRY.collapsed.rowH)))
    : GEOMETRY.collapsed.maxRows);
  const collapsedRows = fitRows(0);
  const panels = useMemo(() => {
    return domains.map((domain, index) => {
      const [lo, hi] = domain;
      const x = d3.scaleLinear().domain(domain).range([0, panelWidth]);
      const offset = index * (panelWidth + gapX);
      let view = views[index];
      let note = null;
      let layout = null;
      let density = null;
      let shownMode = mode;
      let nInView = 0;
      if (view === "models" && models.status !== "ok") {
        note = models.status === "error" ? `isoforms not available (${models.error}); gene bodies from the gene table` : "loading isoforms…";
        view = "arrow-small";
      }
      if (view === "models") {
        const genes = models.genes.filter((g) => P(g, g.end) >= lo && P(g, g.start) <= hi);
        layout = mode === "collapsed"
          ? layoutCollapsed(genes, x, panelWidth, measure, { priority, maxRows: collapsedRows })
          : layoutIsoforms(genes, x, panelWidth, measure, { mode, priority });
        if (!genes.length) note = "no annotated genes in this window";
      } else {
        shownMode = "collapsed";
        const arrowGenes = arrowGenesInWindow(store, lo, hi).map((g) => ({
          id: `a${g.index}`, name: g.name, strand: g.strand, offset: 0, start: g.start, end: g.end, transcripts: [], arrowIndex: g.index,
        }));
        nInView = arrowGenes.length;
        if (view !== "arrow-small") density = densityBins(arrowGenes, lo, hi, Math.max(1, Math.floor(panelWidth / 3)));
        if (view === "density") {
          const prio = arrowGenes.filter((g) => priority && priority.has(g.name));
          const labels = placeLabels(prio.map((g) => ({ key: g.id, x: x((g.start + g.end) / 2), w: measure(g.name), priority: 1 })), panelWidth);
          layout = { items: prio.map((g) => ({ gene: g, row: 0, label: labels.get(g.id) || null, priority: true, model: { segments: [] } })), rows: 1 };
          if (!priority) note = "zoom in for gene names (density of coding genes)";
        } else if (view === "arrow") {
          // > 20 Mb: gene bodies on one line under the density strip; names (priority genes, then the longest) where they fit
          const labels = placeLabels(
            arrowGenes.map((g) => ({ key: g.id, x: x((g.start + g.end) / 2), w: measure(g.name), priority: priority && priority.has(g.name) ? 1 : 0, size: g.end - g.start })),
            panelWidth
          );
          layout = { items: arrowGenes.filter((g) => labels.has(g.id)).map((g) => ({ gene: g, row: 0, label: labels.get(g.id), priority: !!(priority && priority.has(g.name)), model: { segments: [] } })), rows: 1 };
          if (!note) note = "≤ 20 Mb shows exons and isoforms";
        } else {
          layout = layoutCollapsed(arrowGenes, x, panelWidth, measure, { priority, maxRows: collapsedRows });
        }
      }
      return { index, domain, x, offset, width: panelWidth, view, mode: shownMode, layout, density, note, nInView };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains.toString(), panelWidth, gapX, mode, models.genes, models.status, store?.geneTypes, priority, genomeSpan, collapsedRows]);

  // vertical geometry
  const stripH = panels.some((p) => p.density) ? GEOMETRY.density.strip + 4 : 0;
  const rows = Math.max(1, ...panels.map((p) => p.layout?.rows || 1));
  const anyIso = panels.some((p) => p.mode !== "collapsed");
  const heightMode = anyIso ? mode : "collapsed";
  const h = trackHeight(heightMode, rows);
  const contentH = stripH + h.content;
  // maxHeight is the host's budget for collapsed mode; squished / expanded keep their own caps (the host grows)
  const cap = heightMode === "collapsed" ? maxHeight : GEOMETRY[heightMode].cap + stripH;
  const visibleH = cap ? Math.min(contentH, cap) : contentH;
  const scrolls = contentH > visibleH;
  const totalH = visibleH + (showControls ? 30 : 0);
  useEffect(() => {
    if (onHeightChange) onHeightChange(totalH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalH]);

  // d3 zoom / pan on each panel, synced to the shared domains like the other gOS tracks
  useEffect(() => {
    if (!interactive || !defaultDomain) return;
    panels.forEach((panel, index) => {
      const node = panelRefs.current[index];
      if (!node) return;
      const genomeScale = d3.scaleLinear().domain(defaultDomain).range([0, panel.width]);
      const zoom = d3.zoom()
        .scaleExtent([1, Infinity])
        .translateExtent([[0, 0], [panel.width, contentH]])
        .extent([[0, 0], [panel.width, contentH]])
        .filter((event) => {
          if (event.type === "dblclick") return false;
          if (zoomedByCmd) return !event.button && event.metaKey;
          if (event.type === "wheel" && scrolls) return event.ctrlKey || event.altKey || event.metaKey;
          return !event.button && !event.shiftKey;
        })
        .on("zoom", (event) => {
          if (!event.sourceEvent) return;
          const nd = event.transform.rescaleX(genomeScale).domain().map(Math.round);
          const next = [...domains];
          next[index] = clampDomain(domains, index, nd);
          if (next.toString() !== domains.toString()) dispatch(settingsActions.updateDomains(next));
        });
      const sel = d3.select(node);
      sel.call(zoom);
      const s = [genomeScale(panel.domain[0]), genomeScale(panel.domain[1])];
      sel.call(zoom.transform, d3.zoomIdentity.scale(panel.width / Math.max(1e-9, s[1] - s[0])).translate(-s[0], 0));
    });
    const nodes = [...panelRefs.current];
    return () => nodes.forEach((node) => node && d3.select(node).on(".zoom", null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, contentH, zoomedByCmd, scrolls, interactive]);

  const onPanelMove = useCallback(
    (e, panel) => {
      if (!hoverLine) return;
      const r = e.currentTarget.getBoundingClientRect();
      dispatch(settingsActions.updateHoveredLocation(panel.x.invert(e.clientX - r.left), panel.index));
    },
    [dispatch, hoverLine]
  );

  const showHover = (e, payload) => {
    clearTimeout(hideTimer.current);
    const root = containerRef.current?.getBoundingClientRect();
    if (!root) return;
    setHover({ ...payload, left: e.clientX - root.left, top: e.clientY - root.top });
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), 250);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const zoomToGene = (panel, gene, e) => {
    if (!interactive) return;
    if (e?.shiftKey) {
      if (onGeneShiftClick) onGeneShiftClick(gene.name);
      return;
    }
    const a = P(gene, gene.start);
    const b = P(gene, gene.end);
    const pad = Math.max(1000, Math.round(0.1 * (b - a)));
    const next = [...domains];
    next[panel.index] = clampDomain(domains, panel.index, [Math.max(1, a - pad), b + pad]);
    dispatch(settingsActions.updateDomains(next));
  };

  const geneColor = (gene, tx) => {
    if (hover && hover.gene?.id === gene.id && (!tx || !hover.tx || hover.tx.id === tx.id)) return col.hover;
    const cls = geneClass(tx ? tx.type : gene.type || "protein_coding");
    return col[cls] || col.coding;
  };

  const exonHover = (e, panel, gene, tx, seg) => {
    const t = tx || gene.transcripts.find((d) => d.canonical) || gene.transcripts[0];
    let exon = null;
    if (t) {
      const mid = (seg.start + seg.end) / 2;
      const k = t.exons.findIndex(([s, en]) => mid >= s && mid <= en);
      if (k >= 0) exon = { ...exonInfo(t, gene.strand)[k], transcript: t.name, kind: seg.kind };
    }
    e.stopPropagation();
    showHover(e, { gene, tx: tx || null, exon, panel: panel.index });
  };

  const renderPanel = (panel) => {
    const { layout, x } = panel;
    const top = stripH;
    const out = [];
    if (panel.density) {
      const d = panel.density;
      const bw = panel.width / d.counts.length;
      out.push(
        <g key="density" transform="translate(0,2)">
          <rect x={0} y={0} width={panel.width} height={GEOMETRY.density.strip} fill={theme.band} />
          {d.counts.map((c, k) => c > 0 && (
            <rect key={k} x={k * bw} width={Math.max(0.8, bw - 0.4)} y={GEOMETRY.density.strip * (1 - c / Math.max(1, d.max))}
              height={GEOMETRY.density.strip * (c / Math.max(1, d.max))} fill={col.density} fillOpacity={0.75}
              onMouseMove={(e) => showHover(e, { density: { count: c, lo: d.lo + k * d.binSize, hi: d.lo + (k + 1) * d.binSize }, panel: panel.index })}
              onMouseOut={scheduleHide} />
          ))}
        </g>
      );
    }
    if (!layout) return out;
    if (panel.mode === "collapsed") {
      const geo = GEOMETRY.collapsed;
      layout.items.forEach(({ gene, row, label, model, priority: isP }) => {
        const y0 = top + 4 + row * geo.rowH;
        const yc = y0 + geo.labelH + 7;
        const span = visibleSpan(x, P(gene, gene.start), P(gene, gene.end) + 1, panel.width);
        const color = geneColor(gene);
        const hasModel = model?.segments?.length > 0;
        out.push(
          <g key={gene.id} style={{ cursor: "pointer" }}
            onMouseMove={(e) => showHover(e, { gene, panel: panel.index })} onMouseOut={scheduleHide}
            onClick={(e) => zoomToGene(panel, gene, e)}>
            {span && <rect x={span[0]} y={yc - geo.cds / 2 - 1} width={Math.max(2, span[1] - span[0])} height={geo.cds + 2} fill="transparent" />}
            {panel.view === "density" ? (
              span && <line x1={(span[0] + span[1]) / 2} x2={(span[0] + span[1]) / 2} y1={yc - 6} y2={yc + 6} stroke={color} strokeWidth={2} />
            ) : (
              <Model x={x} width={panel.width} gene={gene} segments={model?.segments || []} span={span} y={yc} geo={geo} color={color}
                introns={hasModel ? gapsOf(model.segments) : null} chevrons
                onExon={hasModel ? (e, s) => exonHover(e, panel, gene, null, s) : null} />
            )}
            {label && (
              <text x={label.x} y={y0 + geo.labelH - 2} textAnchor="middle" fontSize={LABEL_PX} fontFamily={FONT_FAMILY}
                fontWeight={isP ? 700 : 400} fill={isP ? col.priority : theme.text}>{gene.name}</text>
            )}
          </g>
        );
      });
      return out;
    }
    const geo = GEOMETRY[panel.mode];
    if (panel.mode === "squished") {
      const genesById = new Map(layout.items.map((d) => [d.gene.id, d.gene]));
      layout.geneLabels.forEach((lab, id) => {
        const gene = genesById.get(id);
        if (!gene) return;
        const isP = priority && priority.has(gene.name);
        out.push(
          <text key={`gl-${id}`} x={lab.x} y={top + geo.labelH - 4} textAnchor="middle" fontSize={LABEL_PX} fontFamily={FONT_FAMILY}
            fontWeight={isP ? 700 : 400} fill={isP ? col.priority : theme.text} style={{ cursor: "pointer" }}
            onMouseMove={(e) => showHover(e, { gene, panel: panel.index })} onMouseOut={scheduleHide}
            onClick={(e) => zoomToGene(panel, gene, e)}>{gene.name}</text>
        );
      });
    }
    layout.items.forEach(({ gene, tx, row, label, span }) => {
      const y0 = top + (panel.mode === "squished" ? geo.labelH : 4) + row * geo.rowH;
      const yc = y0 + geo.rowH / 2;
      const color = geneColor(gene, tx);
      out.push(
        <g key={`${gene.id}-${tx.id}`} style={{ cursor: "pointer" }}
          onMouseMove={(e) => showHover(e, { gene, tx, panel: panel.index })} onMouseOut={scheduleHide}
          onClick={(e) => zoomToGene(panel, gene, e)}>
          <rect x={span[0]} y={y0} width={Math.max(2, span[1] - span[0])} height={geo.rowH} fill="transparent" />
          <Model x={x} width={panel.width} gene={gene} segments={transcriptSegments(tx)} introns={transcriptIntrons(tx)} span={span}
            y={yc} geo={geo} color={color} chevrons={panel.mode === "expanded"}
            onExon={(e, s) => exonHover(e, panel, gene, tx, s)} />
          {label && (
            <text x={label.inside ? label.x0 : label.x1} y={yc + 4} textAnchor={label.inside ? "start" : "end"}
              fontSize={LABEL_PX} fontFamily={FONT_FAMILY} fontWeight={tx.canonical ? 700 : 400}
              fill={tx.canonical ? theme.text : theme.textSecondary}
              stroke={label.inside ? theme.panel : "none"} strokeWidth={label.inside ? 3 : 0} paintOrder="stroke">
              {tx.name}
            </text>
          )}
        </g>
      );
    });
    return out;
  };

  const status = [...new Set(panels.map((p) => p.note).filter(Boolean))];
  const hidden = panels.reduce((s, p) => s + (p.layout?.hidden || 0), 0);
  // genes in view (arrow / density views label only some of them: count from the window, not the drawn items)
  const nGenes = panels.reduce((s, p) => s + (p.view === "models" ? new Set((p.layout?.items || []).map((d) => d.gene.id)).size : p.nInView || 0), 0);
  const nTx = panels.reduce((s, p) => s + (p.mode !== "collapsed" ? p.layout?.items?.length || 0 : 0), 0);

  return (
    <div ref={containerRef} className="gos-gene-track" style={{ position: "relative", width }}>
      {showControls && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 28, marginBottom: 2, paddingLeft: gapX, paddingRight: right, whiteSpace: "nowrap" }}>
          <Segmented size="small" value={mode} onChange={setMode} options={MODE_OPTIONS} />
          <Text type="secondary" ellipsis={{ tooltip: true }} style={{ fontSize: TYPE.tick, minWidth: 0, flex: "0 1 auto" }}>
            {[
              nGenes ? `${fmt(nGenes)} gene${nGenes === 1 ? "" : "s"}` : null,
              nTx ? `${fmt(nTx)} isoforms` : null,
              hidden ? `${fmt(hidden)} more isoforms below the row cap` : null,
              ...status,
            ].filter(Boolean).join(" · ")}
          </Text>
          <span style={{ marginLeft: "auto", flex: "none" }}>
            <SvgExportButton containerRef={containerRef} name={exportName} />
          </span>
        </div>
      )}
      <div style={{ maxHeight: visibleH, overflowY: scrolls ? "auto" : "hidden", overflowX: "hidden" }}>
        <svg ref={svgRef} width={width} height={contentH} style={{ display: "block", userSelect: "none", background: "transparent" }}
          fontFamily={FONT_FAMILY}>
          <g transform={`translate(${gapX},0)`}>
            {panels.map((panel, i) => (
              <g key={`p${i}`} transform={`translate(${panel.offset},0)`}>
                <clipPath id={`${uid}-clip-${i}`}>
                  <rect x={0} y={0} width={panel.width} height={contentH} />
                </clipPath>
                <g ref={(n) => (panelRefs.current[i] = n)} clipPath={`url(#${uid}-clip-${i})`}
                  onMouseMove={(e) => onPanelMove(e, panel)}
                  onMouseLeave={() => hoverLine && dispatch(settingsActions.updateHoveredLocation(null, panel.index))}>
                  <rect x={0} y={0} width={panel.width} height={contentH} fill="transparent" style={{ cursor: "grab" }} />
                  {renderPanel(panel)}
                </g>
              </g>
            ))}
            {hoverLine && <HoverMark panels={panels} height={contentH} />}
          </g>
          {panels.length > 0 && (
            <text x={gapX - 6} y={stripH ? 2 + GEOMETRY.density.strip / 2 + 4 : 16} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
              {stripH ? "genes" : ""}
            </text>
          )}
        </svg>
      </div>
      {hover && <HoverCard hover={hover} theme={theme} width={width} onEnter={() => clearTimeout(hideTimer.current)} onLeave={scheduleHide}
        shiftHint={!!onGeneShiftClick} zoomHint={interactive} />}
    </div>
  );
}

/** Gaps between consecutive segments (introns of a collapsed model). */
function gapsOf(segments) {
  const out = [];
  for (let k = 1; k < segments.length; k += 1) if (segments[k].start > segments[k - 1].end + 1) out.push({ start: segments[k - 1].end + 1, end: segments[k].start - 1 });
  return out;
}

const chrLabel = (g) => (g.chromosome ? `chr${g.chromosome}` : "");

function HoverCard({ hover, theme, width, onEnter, onLeave, shiftHint, zoomHint }) {
  const { gene, tx, exon, density } = hover;
  const left = Math.min(Math.max(0, hover.left + 14), Math.max(0, width - 320));
  const style = {
    position: "absolute", left, top: hover.top + 14, zIndex: 20, width: 300, padding: "8px 10px", borderRadius: 6,
    background: theme.raised, color: theme.text, border: `1px solid ${theme.border}`, boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
    fontSize: TYPE.body - 1, lineHeight: 1.45,
  };
  if (density) {
    return (
      <div style={{ ...style, pointerEvents: "none", width: 220 }}>
        <b>{fmt(density.count)}</b> coding gene{density.count === 1 ? "" : "s"} in this bin
        <div style={{ color: theme.muted, fontSize: TYPE.tick }}>{`${fmt(Math.round(density.hi - density.lo))} bp per bin; zoom in for names`}</div>
      </div>
    );
  }
  if (!gene) return null;
  const isModel = gene.transcripts && gene.transcripts.length > 0;
  const coords = isModel ? `${chrLabel(gene)}:${fmt(gene.start)}-${fmt(gene.end)}` : null;
  const links = [{ key: "genecards", label: "GeneCards", href: `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${encodeURIComponent(gene.name)}` },
    ...externalLinks(gene.name).filter((l) => l.key !== "cbio-pancan")];
  return (
    <div style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div><b style={{ fontSize: TYPE.label }}>{gene.name}</b>{" "}
        <span style={{ color: theme.muted }}>{[gene.type ? gene.type.replace(/_/g, " ") : "protein coding", gene.strand ? `${gene.strand} strand` : null].filter(Boolean).join(" · ")}</span>
      </div>
      {coords && <div>{coords} <span style={{ color: theme.muted }}>({fmt(gene.end - gene.start + 1)} bp)</span></div>}
      {isModel && <div style={{ color: theme.muted }}>{`${gene.transcripts.length} isoform${gene.transcripts.length === 1 ? "" : "s"}`}{gene.id ? ` · ${gene.id}` : ""}</div>}
      {tx && (
        <div style={{ marginTop: 4 }}>
          <b>{tx.name}</b> <span style={{ color: theme.muted }}>{tx.id}</span>
          <div style={{ color: theme.textSecondary }}>
            {[tx.type?.replace(/_/g, " "), tx.canonical ? (tx.basis === "MANE_Select" ? "MANE Select" : tx.basis === "Ensembl_canonical" ? "Ensembl canonical" : "canonical (inferred)") : null,
              `${tx.exons.length} exons`, tx.cds ? `CDS ${fmt(tx.cds[1] - tx.cds[0] + 1)} bp span` : "non-coding"].filter(Boolean).join(" · ")}
          </div>
        </div>
      )}
      {exon && (
        <div style={{ marginTop: 4 }}>
          {`Exon ${exon.number} of ${exon.of}`} <span style={{ color: theme.muted }}>({exon.transcript})</span>
          <div style={{ color: theme.textSecondary }}>
            {[`${fmt(exon.size)} bp`, exon.coding ? `${fmt(exon.coding)} bp coding` : "UTR only", exon.frame != null ? `frame ${exon.frame}` : null,
              `${fmt(exon.start)}-${fmt(exon.end)}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      )}
      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
        {links.map((l) => <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>)}
      </div>
      {zoomHint && <div style={{ color: theme.muted, fontSize: TYPE.tick, marginTop: 4 }}>{`click: zoom to ${gene.name}${shiftHint ? " · shift-click: add to the gene filter" : ""}`}</div>}
    </div>
  );
}
