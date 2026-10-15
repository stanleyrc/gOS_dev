import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Select, Tag, Tooltip, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import singleCellActions from "../../redux/singleCell/actions";
import SnvFilterBar from "./snvFilterBar";
import { treeSiteFit } from "../../helpers/singleCell/snvPhyloFit";
import { assignByTreeSet } from "../../helpers/singleCell/snvSigByTree";
import useSignatureModel from "./signatures/useSignatureModel";
import {
  DEFAULT_SNV_TRACKS,
  SNV_TRACKS,
  binDetail,
  binSummary,
  catColor,
  catLegend,
  clickThreshold,
  numFraction,
  SITE_URL_PARAMS,
  fractionOfValue,
  removeFilterKey,
  valueAtFraction,
  parseSiteState,
  serializeSiteState,
  rampColor,
  siteAnnotations,
  toggleMin,
  toggleValue,
  trackDef,
} from "../../helpers/singleCell/snvAnnot";

const { Text } = Typography;
export const TRACK_H = 9;
export const TRACK_GAP = 1;
const LABEL_W = 84;
const MISSING = "#f0f0f0";

/** Height in px of n annotation tracks. */
export const tracksHeight = (n) => (n ? n * (TRACK_H + TRACK_GAP) + 2 : 0);

/** Per-site annotations of the loaded SNV matrix (signature from the patient's joint fit). */
/** Per-site phylogeny-fit metrics of the matrix on a tree layout, computed in the background: { fit, busy }. */
export function useTreeSiteFit(snv, layout) {
  const [state, setState] = useState({ fit: null, busy: false });
  useEffect(() => {
    setState({ fit: null, busy: false });
    if (!snv?.variants?.length || !layout?.leaves?.length) return undefined;
    let stop = false;
    setState({ fit: null, busy: true });
    treeSiteFit(snv, layout, { cancelled: () => stop }).then((fit) => {
      if (!stop && fit) setState({ fit, busy: false });
    });
    return () => {
      stop = true;
    };
  }, [snv, layout]);
  return state;
}

export function useSnvAnnot(snv, phylo = null, fit = null) {
  const model = useSignatureModel();
  const sigSets = useSelector((s) => s.SingleCell.signatures);
  // per-site signature from the fit of the site's own tree-site set (truncal / subclonal / private), else the joint fit
  const assignment = useMemo(() => {
    if (!model.ready) return null;
    const sets = sigSets?.status === "ok" ? sigSets.data?.sets : null;
    return sets && snv ? assignByTreeSet(snv.variants, model.reference, sets, model.assignment) : model.assignment;
  }, [model, sigSets, snv]);
  return useMemo(() => (snv ? siteAnnotations(snv, { signatures: assignment, phylo, fit }) : null), [snv, assignment, phylo, fit]);
}

/** Selected tracks, the click-to-filter state and handler to pass to MutationSidePanel. */
export function useSnvTracks(annot) {
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout) || {};
  const tracks = useMemo(() => {
    const want = layout.snvTracks || DEFAULT_SNV_TRACKS;
    return annot ? want.filter((k) => annot.available.includes(k)) : [];
  }, [layout.snvTracks, annot]);
  const onTrackClick = useCallback(
    (key, summary) => {
      if (!summary) return;
      if (key === "category") {
        if (!summary.top) return;
        const cur = layout.snvCategories || [];
        const next = cur.includes(summary.top) ? cur.filter((k) => k !== summary.top) : [...cur, summary.top];
        dispatch(singleCellActions.updateLayout({ snvCategories: next.length ? next : null }));
      } else if (trackDef(key)?.kind === "cat") {
        if (summary.top == null) return;
        dispatch(singleCellActions.updateLayout({ snvAnnotFilter: toggleValue(layout.snvAnnotFilter, key, summary.top) }));
      } else {
        const x = clickThreshold(summary.mean);
        if (x != null) dispatch(singleCellActions.updateLayout({ snvAnnotFilter: toggleMin(layout.snvAnnotFilter, key, x) }));
      }
    },
    [dispatch, layout.snvCategories, layout.snvAnnotFilter]
  );
  return { annot, tracks, filter: layout.snvAnnotFilter || null, onTrackClick };
}

/**
 * Labelled annotation strips above the SNV columns. Binned pixels show the
 * commonest class (or the mean of a metric); hovering lists every annotation of
 * the site, clicking a value filters the sites to it.
 */
export function AnnotationStrips({ annot, tracks, columnOrder, bins, width, pixelRatio, onTrackClick, labelSide = "left" }) {
  const deviceWidth = Math.floor(width * pixelRatio);
  const [tip, setTip] = useState(null);
  const summaryAt = useCallback(
    (key, x) => {
      const a = bins.binStart[x];
      const b = bins.binEnd[x];
      return a < 0 ? null : binSummary(annot, key, columnOrder, a, b);
    },
    [annot, bins, columnOrder]
  );
  const point = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(deviceWidth - 1, Math.floor((e.clientX - rect.left) * pixelRatio)));
  };
  return (
    <div style={{ position: "relative", width }}>
      {tracks.map((key) => {
        const def = trackDef(key);
        return (
          <div key={key} style={{ position: "relative", height: TRACK_H + TRACK_GAP }}>
            <Tooltip title={def.help} placement={labelSide === "right" ? "right" : "left"}>
              <span className="sc-track-label" style={{ position: "absolute", ...(labelSide === "right" ? { left: "100%", marginLeft: 4, textAlign: "left" } : { right: "100%", marginRight: 4, textAlign: "right" }), width: LABEL_W, fontSize: 10, lineHeight: `${TRACK_H}px`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--sc-muted, #666)" }}>
                {def.label}
              </span>
            </Tooltip>
            <TrackCanvas
              annot={annot}
              trackKey={key}
              deviceWidth={deviceWidth}
              width={width}
              pixelRatio={pixelRatio}
              summaryAt={summaryAt}
              onMove={(e) => {
                const x = point(e);
                const a = bins.binStart[x];
                setTip(a < 0 ? null : { x: e.clientX, y: e.clientY, rows: binDetail(annot, columnOrder, a, bins.binEnd[x], tracks), key });
              }}
              onLeave={() => setTip(null)}
              onClick={(e) => onTrackClick && onTrackClick(key, summaryAt(key, point(e)))}
            />
          </div>
        );
      })}
      {tip && tip.rows.length > 0 && (
        <div
          style={{ position: "fixed", left: tip.x + 12, top: tip.y + 14, zIndex: 1100, pointerEvents: "none", background: "var(--sc-raised, #fff)", color: "var(--sc-text, #222)", border: "1px solid var(--sc-border, #ccc)", borderRadius: 4, padding: "4px 8px", fontSize: 11, maxWidth: 360, boxShadow: "0 2px 8px rgba(0,0,0,.18)" }}
        >
          {tip.rows.map(([k, v]) => (
            <div key={k}>
              <b>{k}</b>: {v}
            </div>
          ))}
          <div style={{ opacity: 0.6, marginTop: 2 }}>click to filter by this value</div>
        </div>
      )}
    </div>
  );
}

function TrackCanvas({ annot, trackKey, deviceWidth, width, pixelRatio, summaryAt, onMove, onLeave, onClick }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const def = trackDef(trackKey);
    const h = Math.round(TRACK_H * pixelRatio);
    ctx.fillStyle = MISSING;
    ctx.fillRect(0, 0, deviceWidth, h);
    for (let x = 0; x < deviceWidth; x += 1) {
      const s = summaryAt(trackKey, x);
      if (!s) continue;
      if (def.kind === "cat") {
        if (s.top == null) continue;
        if (trackKey === "driver") {
          if (s.top !== "driver") continue;
          ctx.fillStyle = "#cf1322";
          ctx.fillRect(Math.max(0, x - pixelRatio), 0, 2 * pixelRatio + 1, h); // rare: widen the tick
          continue;
        }
        ctx.fillStyle = catColor(annot, trackKey, s.top);
        ctx.fillRect(x, 0, 1, h);
      } else {
        if (!s.valued) continue;
        ctx.fillStyle = rampColor(numFraction(annot, trackKey, s.mean));
        ctx.fillRect(x, 0, 1, h);
      }
    }
  }, [annot, trackKey, deviceWidth, pixelRatio, summaryAt]);
  return (
    <canvas
      ref={ref}
      width={deviceWidth}
      height={Math.round(TRACK_H * pixelRatio)}
      style={{ width, height: TRACK_H, display: "block", cursor: "pointer" }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
    />
  );
}

const fmt = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : Number(x.toPrecision(3)).toString()) : "n/a");


/**
 * Legend of a numeric track: the colour ramp is a clickable scale. Click a
 * point to keep sites at or above that value; the active threshold is drawn
 * as a marker with a clear button.
 */
function NumericLegend({ annot, def, filter, setFilter }) {
  const key = def.key;
  const range = annot.ranges[key] || [0, 1];
  const [lo, hi] = range;
  const active = filter?.[key]?.min;
  const W = 120;
  const onClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = valueAtFraction(range, (e.clientX - rect.left) / rect.width);
    setFilter(toggleMin(filter, key, x));
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <b>{def.label}</b>
      <Text type="secondary">{"\u2265"}</Text>
      {fmt(lo)}
      <Tooltip title={`Click to keep sites at or above that ${def.label} value`}>
        <span
          role="button"
          aria-label={`Filter ${def.label} at or above a value`}
          onClick={onClick}
          style={{ position: "relative", display: "inline-block", width: W, height: 12, cursor: "pointer", background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})`, border: "1px solid rgba(0,0,0,.25)", borderRadius: 2 }}
        >
          {active != null && (
            <span style={{ position: "absolute", left: `${fractionOfValue(range, active) * 100}%`, top: -3, bottom: -3, width: 2, marginLeft: -1, background: "#1677ff", boxShadow: "0 0 0 1px #fff" }} />
          )}
        </span>
      </Tooltip>
      {fmt(hi)}
      {active != null ? (
        <Tag closable color="blue" style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: "14px" }} onClose={() => setFilter(removeFilterKey(filter, key))}>
          {"\u2265"} {fmt(active)}
        </Tag>
      ) : (
        <Text type="secondary">(click the bar)</Text>
      )}
    </span>
  );
}

/**
 * Track picker (stored in the layout and the URL as sntracks / snfilter),
 * per-track legends (click a swatch to filter to it) and the active filters.
 */
export function SnvTrackControls({ annot, nShown = null, onIsolate = null, fitBusy = false }) {
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout) || {};
  const patient = useSelector((s) => s.SingleCell.patient);
  const { tracks, onTrackClick } = useSnvTracks(annot);
  const filter = layout.snvAnnotFilter || null;
  const [urlRead, setUrlRead] = useState(false);
  const legendHidden = Boolean(layout.snvLegendHidden);
  const [legendOpen, setLegendOpen] = useState(false);
  const [legendOverflow, setLegendOverflow] = useState(false);
  const legendRef = useRef(null);
  useEffect(() => {
    const el = legendRef.current;
    setLegendOverflow(Boolean(el && el.scrollHeight > 36));
  }, [annot, tracks, legendOpen, legendHidden, layout.snvAnnotFilter]);

  // a link carries the tracks and filter; read once when the patient has loaded
  useEffect(() => {
    if (urlRead || !patient) return;
    setUrlRead(true);
    try {
      const patch = parseSiteState(window.location.search);
      if (Object.keys(patch).length) dispatch(singleCellActions.updateLayout(patch));
    } catch (e) {
      // no window
    }
  }, [urlRead, patient, dispatch]);
  useEffect(() => {
    if (!urlRead) return;
    try {
      const url = new URL(window.location.href);
      SITE_URL_PARAMS.forEach((k) => url.searchParams.delete(k));
      Object.entries(serializeSiteState(layout)).forEach(([k, v]) => url.searchParams.set(k, v));
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch (e) {
      // no history
    }
  }, [urlRead, layout]);

  if (!annot) return null;
  const options = SNV_TRACKS.filter((d) => annot.available.includes(d.key)).map((d) => ({ value: d.key, label: d.label, title: d.help }));
  const setFilter = (next) => dispatch(singleCellActions.updateLayout({ snvAnnotFilter: next }));
  const swatchClick = (key, value) => {
    if (key === "category") onTrackClick(key, { top: value });
    else setFilter(toggleValue(filter, key, value));
  };
  const isOn = (key, value) => (key === "category" ? (layout.snvCategories || []).includes(value) : (filter?.[key]?.values || []).includes(value));
  return (
    <div className="sc-track-controls" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Text type="secondary">Annotation tracks</Text>
        <Select
          size="small"
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          style={{ minWidth: 260 }}
          placeholder="Choose tracks"
          value={tracks}
          options={options}
          onChange={(value) => dispatch(singleCellActions.updateLayout({ snvTracks: value.length ? value : [] }))}
        />
      </div>
      <SnvFilterBar annot={annot} nShown={nShown ?? annot.n} onIsolate={onIsolate} fitBusy={fitBusy} />
      {tracks.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          <Button type="text" size="small" style={{ height: 18, padding: "0 4px" }} aria-label={legendHidden ? "Show legend" : "Hide legend"} icon={legendHidden ? <RightOutlined /> : <DownOutlined />} onClick={() => dispatch(singleCellActions.updateLayout({ snvLegendHidden: !legendHidden }))} />
          {legendHidden ? (
            <Text type="secondary" style={{ fontSize: 11 }}>Track legend</Text>
          ) : (
        <>
        <div ref={legendRef} style={{ flex: 1, display: "flex", flexWrap: "wrap", columnGap: 16, rowGap: 2, fontSize: 11, lineHeight: "16px", maxHeight: legendOpen ? "none" : 34, overflow: "hidden" }}>
          {tracks.map((key) => {
            const def = trackDef(key);
            if (def.kind === "num") {
              return <NumericLegend key={key} annot={annot} def={def} filter={filter} setFilter={setFilter} />;
            }
            return (
              <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <b>{def.label}</b>
                {catLegend(annot, key).map((e) => (
                  <span
                    key={e.value}
                    onClick={() => swatchClick(key, e.value)}
                    style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, padding: "0 3px", borderRadius: 3, outline: isOn(key, e.value) ? "1.5px solid #1677ff" : "none" }}
                    title={`Show only ${e.label} sites`}
                  >
                    <span style={{ width: 9, height: 9, background: e.color, display: "inline-block", border: "1px solid rgba(0,0,0,.15)" }} />
                    {e.label} ({e.count})
                  </span>
                ))}
              </span>
            );
          })}
        </div>
        {(legendOverflow || legendOpen) && (
          <Button type="link" size="small" style={{ height: 18, padding: 0, fontSize: 11 }} onClick={() => setLegendOpen(!legendOpen)}>
            {legendOpen ? "less" : "more"}
          </Button>
        )}
        </>
          )}
        </div>
      )}
    </div>
  );
}
