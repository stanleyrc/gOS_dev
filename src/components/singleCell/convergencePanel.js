import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Card, Input, InputNumber, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { BranchesOutlined, CloseOutlined } from "@ant-design/icons";
import useTreeView from "./useTreeView";
import useContainerWidth from "./useContainerWidth";
import { useSnvAnnot } from "./snvAnnotTracks";
import singleCellActions from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import { armsFromCytobands, convergentEvents, eventCarriers } from "../../helpers/singleCell/convergence";
import {
  CONV_EVENT,
  CONV_PARAM,
  DEFAULT_CONV_OPTIONS,
  carrierGroups,
  cnSpecLabel,
  convergenceEvidence,
  convergenceSummary,
  eventConvKey,
  eventConvLabel,
  evidenceTotals,
  parseConvSpec,
  rankEventCandidates,
  regionCarriers,
  resolveRegion,
  rowMedian,
  serializeConvSpec,
} from "../../helpers/singleCell/convergenceEvidence";
import { filterSnvColumns } from "../../helpers/singleCell/snvSites";
import { normalizePalette } from "../../helpers/singleCell/matrix";

const { Text } = Typography;
const GROUP_COLORS = ["#D7191C", "#2C7BB6", "#1A9641", "#7B3294", "#E66101", "#008080", "#A6761D", "#E7298A"];
const SCATTERED = "#FDAE61";
const NONCARRIER = "#BDBDBD";
const ALT = "#B2182B";
const REF = "#9ECAE1";
const NOCOV = "#F0F0F0";
const MAX_COLS = 160;
const pct = (x) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "–");

const readSpec = () => {
  try {
    return parseConvSpec(new URL(window.location.href).searchParams.get(CONV_PARAM));
  } catch (e) {
    return null;
  }
};
const writeSpec = (spec) => {
  try {
    const url = new URL(window.location.href);
    const v = serializeConvSpec(spec);
    if (v) url.searchParams.set(CONV_PARAM, v);
    else url.searchParams.delete(CONV_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch (e) {
    // no URL API: state only
  }
};

/** Tree + carrier strip + CN over the event region + evidence SNV columns, rows = tree leaves. */
function ConvergenceFigure({ layout, groupsRes, carriers, normals, cnStrip, snv, sites, width }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const n = layout.leaves.length;
  const height = Math.max(320, Math.min(640, n * 4));
  const top = 36;
  const rowH = (height - top) / n;
  const treeW = Math.min(240, Math.round(width * 0.22));
  const stripX = treeW + 4;
  const cnX = stripX + 16;
  const cnW = cnStrip ? 140 : 0;
  const snvX = cnX + cnW + 12;
  const blocks = useMemo(() => {
    const out = [];
    sites.forEach((s) => {
      if (!out.length || out[out.length - 1].label !== s.group) out.push({ label: s.group, kind: s.kind, sites: [] });
      out[out.length - 1].sites.push(s);
    });
    return out;
  }, [sites]);
  const gap = 8;
  const MIN_BLOCK = 92; // room for the block label
  const colW = sites.length ? Math.max(2, Math.min(24, (width - snvX - (gap + MIN_BLOCK) * blocks.length - 4) / sites.length)) : 0;
  const blockW = useCallback((blk) => Math.max(MIN_BLOCK, blk.sites.length * colW), [colW]);
  const leafGroup = useMemo(() => {
    const m = new Map();
    groupsRes.groups.forEach((g, i) => g.ids.forEach((id) => m.set(id, i)));
    return m;
  }, [groupsRes]);
  const nodeColor = useMemo(() => {
    const out = new Array(layout.nodes.length).fill(null);
    groupsRes.groups.forEach((g, i) => {
      const mark = (k) => {
        out[k] = GROUP_COLORS[i % GROUP_COLORS.length];
        (layout.nodes[k].children || []).forEach(mark);
      };
      mark(g.node);
    });
    return out;
  }, [layout, groupsRes]);
  const rowOf = useMemo(() => (snv ? new Map(snv.cells.map((id, p) => [`${id}`, p])) : null), [snv]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const span = Math.max(layout.maxX || 0, 1e-9);
    const px = (x) => 4 + (x / span) * (treeW - 8);
    const py = (y) => top + (y + 0.5) * rowH;
    ctx.lineWidth = n > 300 ? 0.6 : 1;
    layout.nodes.forEach((nd, k) => {
      ctx.strokeStyle = nodeColor[k] || "#9E9E9E";
      if (nd.parent >= 0) {
        const p = layout.nodes[nd.parent];
        ctx.beginPath();
        ctx.moveTo(px(p.x), py(nd.y));
        ctx.lineTo(px(nd.x), py(nd.y));
        ctx.stroke();
      }
      if (!nd.isLeaf && nd.children?.length) {
        const ys = nd.children.map((c) => layout.nodes[c].y);
        ctx.strokeStyle = nodeColor[k] || "#9E9E9E";
        ctx.beginPath();
        ctx.moveTo(px(nd.x), py(Math.min(...ys)));
        ctx.lineTo(px(nd.x), py(Math.max(...ys)));
        ctx.stroke();
      }
    });
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#595959";
    ctx.save();
    ctx.translate(stripX + 9, top - 3);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("event", 0, 0);
    ctx.restore();
    if (cnStrip) ctx.fillText(`CN ${cnStrip.label}`, cnX, 26);
    layout.leaves.forEach((id, i) => {
      const y = top + i * rowH;
      const h = Math.max(rowH, 0.8);
      const key = `${id}`;
      const g = leafGroup.get(key);
      ctx.fillStyle = normals.has(key) ? "#FFFFFF" : g != null && carriers.has(key) ? GROUP_COLORS[g % GROUP_COLORS.length] : carriers.has(key) ? SCATTERED : g != null ? "#FBE3D6" : NONCARRIER;
      ctx.fillRect(stripX, y, 10, h);
      if (cnStrip) {
        const vals = cnStrip.values.get(key);
        const bw = cnW / cnStrip.nBins;
        for (let b = 0; b < cnStrip.nBins; b += 1) {
          const v = vals ? vals[b] : NaN;
          ctx.fillStyle = Number.isFinite(v) ? cnStrip.colors[Math.max(0, Math.min(cnStrip.colors.length - 1, Math.floor(v)))] : cnStrip.missing;
          ctx.fillRect(cnX + b * bw, y, bw + 0.3, h);
        }
      }
      if (snv && rowOf) {
        const p = rowOf.get(key);
        let x = snvX;
        blocks.forEach((blk) => {
          blk.sites.forEach((s, q) => {
            const st = p == null ? -1 : snv.status[p][s.c];
            ctx.fillStyle = st === 1 ? ALT : st === 0 ? REF : NOCOV;
            ctx.fillRect(x + q * colW, y, Math.max(1, colW - (colW > 3 ? 1 : 0)), h);
          });
          x += blockW(blk) + gap;
        });
      }
    });
    if (cnStrip) {
      // event region marks on the CN strip
      ctx.strokeStyle = "#262626";
      ctx.lineWidth = 1;
      [cnStrip.markA, cnStrip.markB].forEach((m) => {
        const x = cnX + m * cnW;
        ctx.beginPath();
        ctx.moveTo(x, top - 4);
        ctx.lineTo(x, height);
        ctx.stroke();
      });
    }
    let x = snvX;
    ctx.fillStyle = "#262626";
    ctx.font = "11px sans-serif";
    blocks.forEach((blk) => {
      const w = blockW(blk);
      ctx.fillStyle = blk.kind === "split" ? "#262626" : "#8c8c8c";
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, w + gap - 2, top);
      ctx.clip();
      ctx.fillText(blk.label, x, 12);
      ctx.fillText(`${blk.sites.length} SNV${blk.sites.length === 1 ? "" : "s"}`, x, 26);
      ctx.restore();
      x += w + gap;
    });
  }, [layout, groupsRes, carriers, normals, cnStrip, snv, rowOf, blocks, colW, width, height, n, rowH, blockW, treeW, stripX, cnX, cnW, snvX, leafGroup, nodeColor]);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const i = Math.floor((my - top) / rowH);
    if (i < 0 || i >= n) return setHover(null);
    const id = `${layout.leaves[i]}`;
    const g = leafGroup.get(id);
    const who = normals.has(id) ? "normal cell" : carriers.has(id) ? (g != null ? `carrier, ${groupsRes.groups[g].name}` : "carrier outside the groups") : "non-carrier";
    let site = "";
    if (snv && mx >= snvX) {
      let x = snvX;
      blocks.some((blk) => {
        const w = blk.sites.length * colW;
        if (mx >= x && mx < x + w) {
          const s = blk.sites[Math.min(blk.sites.length - 1, Math.floor((mx - x) / colW))];
          const p = rowOf.get(id);
          const st = p == null ? -1 : snv.status[p][s.c];
          site = ` · ${s.id} (${blk.label}): ${st === 1 ? "alt read" : st === 0 ? "reference only" : "no reads"}`;
          return true;
        }
        x += blockW(blk) + gap;
        return false;
      });
    }
    if (cnStrip && mx >= cnX && mx < cnX + cnW) {
      const vals = cnStrip.values.get(id);
      const b = Math.floor(((mx - cnX) / cnW) * cnStrip.nBins);
      site = ` · CN ${vals && Number.isFinite(vals[b]) ? vals[b].toFixed(1) : "not available"}`;
    }
    return setHover(`${id} · ${who}${site}`);
  };

  return (
    <div>
      <canvas ref={ref} style={{ width, height, display: "block", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      <Text type="secondary" style={{ fontSize: 12, minHeight: 18, display: "block" }}>
        {hover || "Rows: tree leaves. Strip: carrier groups in colour, carriers outside groups orange, non-carriers grey. SNV columns: red alt read, blue reference only, light grey no reads."}
      </Text>
    </div>
  );
}

/**
 * Convergent evolution of one event in this patient: carrier groups on the
 * tree and the SNVs that place a carrier group with non-carriers (apart from
 * another carrier group) versus SNVs shared by carrier groups only.
 * conv= in the URL; opened from the Drivers drawer, the Filtered Events table
 * and the cohort Convergent evolution table.
 */
export default function ConvergencePanel() {
  const dispatch = useDispatch();
  const { cn, cells, snv, palette, patient, layout: scLayout } = useSelector((s) => s.SingleCell);
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const genomeLength = useSelector((s) => s.Settings.genomeLength);
  const cytobands = useSelector((s) => s.Cytobands?.data);
  const { optionsList: geneOptions, genesStartPoint, genesEndPoint } = useSelector((s) => s.Genes);
  const { treeLayout } = useTreeView();
  const [ref, width] = useContainerWidth(900);
  const [spec, setSpec] = useState(readSpec);
  const [open, setOpen] = useState(() => Boolean(readSpec()));
  const [opts, setOpts] = useState(DEFAULT_CONV_OPTIONS);
  const [custom, setCustom] = useState({ region: "", dir: "loss", rule: "delta", thr: 0.75 });
  const caseId = patient?.caseReportId || "";

  useEffect(() => {
    const on = (e) => {
      const s = parseConvSpec(e.detail?.spec);
      setSpec(s);
      if (s) setOpen(true);
      if (s) setTimeout(() => document.getElementById("sc-convergence-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    };
    window.addEventListener(CONV_EVENT, on);
    return () => window.removeEventListener(CONV_EVENT, on);
  }, []);
  useEffect(() => {
    if (spec) setTimeout(() => document.getElementById("sc-convergence-panel")?.scrollIntoView({ behavior: "auto", block: "start" }), 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = (s) => {
    setSpec(s);
    writeSpec(s);
  };

  const normals = useMemo(() => new Set(cells.filter((c) => /^normal$/i.test(`${c.clone_id || ""}`)).map((c) => `${c.cell_id}`)), [cells]);
  const arms = useMemo(() => armsFromCytobands(cytobands, chromoBins || {}), [cytobands, chromoBins]);
  const genes = useMemo(() => {
    const m = new Map();
    (geneOptions || []).forEach((o) => m.set(o.label, { start: Number(genesStartPoint[o.value]), end: Number(genesEndPoint[o.value]) }));
    return m;
  }, [geneOptions, genesStartPoint, genesEndPoint]);

  // candidates: filtered events (most carrier groups first) and CN arm / focal calls that hit >= 2 clades
  const eventCands = useMemo(() => (open && treeLayout ? rankEventCandidates(events, treeLayout, { ...opts, exclude: normals }) : []), [open, events, treeLayout, opts, normals]);
  const cnCands = useMemo(() => {
    if (!open || cn.status !== "ok" || !treeLayout || !arms.length) return [];
    const genePos = new Map([...genes.entries()].map(([g, v]) => [g, (v.start + v.end) / 2]));
    return convergentEvents(treeLayout, eventCarriers(cn.data, arms, genePos), { exclude: normals }).map((r) => {
      const [region, what] = r.event.split(" ");
      const s = what === "amp" ? { kind: "cn", dir: "gain", rule: "delta", thr: 3, region } : what === "homdel" ? { kind: "cn", dir: "loss", rule: "abs", thr: 0, region } : { kind: "cn", dir: what, rule: "delta", thr: 0.75, region };
      return { value: serializeConvSpec(s), label: `${r.event} · ${r.hits.length} clades (CN call)` };
    });
  }, [open, cn, treeLayout, arms, genes, normals]);

  const target = useMemo(() => {
    if (!spec) return null;
    if (spec.kind === "ev") {
      const e = (events || []).find((x) => eventConvKey(x) === spec.key);
      if (!e) return { error: `event ${spec.key} not in this patient's filtered events` };
      const ids = `${e.cell_ids || ""}`.split(",").filter(Boolean);
      const c = chromoBins?.[`${e.seqnames}`.replace(/^chr/, "")];
      const s = Number(e.start);
      const en = Number(e.end);
      const interval = c && Number.isFinite(s) ? { gStart: c.startPlace + s, gEnd: c.startPlace + Math.max(en || s, s + 1), focal: true, label: `${e.gene || e.seqnames}` } : null;
      return { label: eventConvLabel(e), carriers: new Set(ids), interval };
    }
    if (cn.status !== "ok") return { error: "no per-cell copy number loaded" };
    const interval = resolveRegion(spec.region, { arms, chromoBins: chromoBins || {}, genes });
    if (!interval) return { error: `region "${spec.region}" not recognised (arm like 15q, chromosome, chr:start-end or gene)` };
    const calls = regionCarriers(cn.data, interval, spec, arms);
    return { label: cnSpecLabel({ ...spec, region: interval.label }), carriers: new Set([...calls.entries()].filter(([, v]) => v.carrier).map(([k]) => k)), interval };
  }, [spec, events, cn, arms, chromoBins, genes]);

  const groupsRes = useMemo(() => (target?.carriers && treeLayout ? carrierGroups(treeLayout, target.carriers, { ...opts, exclude: normals }) : null), [target, treeLayout, opts, normals]);
  const snvReady = snv?.status === "ok" && snv.data?.status?.length > 0;
  const snvReason = snvReady ? null : snv?.status === "error" ? "the SNV matrix failed to load" : `${caseId} SNVs not exported yet`;
  const annot = useSnvAnnot(open && snvReady ? snv.data : null, null, null);
  const columns = useMemo(() => {
    if (!snvReady) return null;
    const all = snv.data.variants.map((_, c) => c);
    const { snvCategories, snvCellphyOnly, snvMinCladeScore, snvAnnotFilter } = scLayout;
    return filterSnvColumns(snv.data, all, { snvCategories, snvCellphyOnly, snvMinCladeScore, snvAnnotFilter, annot });
  }, [snvReady, snv, scLayout, annot]);
  const ev = useMemo(() => (groupsRes && snvReady && groupsRes.groups.length >= 2 ? convergenceEvidence(snv.data, groupsRes, columns, opts) : null), [groupsRes, snvReady, snv, columns, opts]);
  const shownSites = useMemo(() => {
    if (!ev) return [];
    // cap per column group so every group stays visible
    const per = new Map();
    ev.sites.forEach((s) => per.set(s.group, [...(per.get(s.group) || []), s]));
    const cap = Math.max(10, Math.floor(MAX_COLS / Math.max(1, per.size)));
    return [...per.values()].flatMap((l) => [...l].sort((a, b) => b.score - a.score).slice(0, cap));
  }, [ev]);

  const cnStrip = useMemo(() => {
    if (!target?.interval || cn.status !== "ok" || !treeLayout) return null;
    const { gStart, gEnd, focal } = target.interval;
    const len = gEnd - gStart;
    const pad = focal ? Math.max(5e6, 2 * len) : 0.1 * len;
    const a = gStart - pad;
    const b = gEnd + pad;
    const nBins = 60;
    const step = (b - a) / nBins;
    const rowById = new Map(cn.data.cells.map((id, k) => [`${id}`, cn.data.rows[k]]));
    const values = new Map();
    treeLayout.leaves.forEach((id) => {
      const row = rowById.get(`${id}`);
      if (!row) return;
      values.set(`${id}`, Array.from({ length: nBins }, (_, k) => rowMedian(row, a + k * step, a + (k + 1) * step, Math.max(step / 4, 1e5))));
    });
    const p = normalizePalette(palette, palette?.preset);
    return { values, nBins, colors: p.total, missing: p.missing, label: target.interval.label, markA: (gStart - a) / (b - a), markB: (gEnd - a) / (b - a), domain: [Math.max(1, a), Math.min(genomeLength || b, b)] };
  }, [target, cn, treeLayout, palette, genomeLength]);

  const summary = target && !target.error && groupsRes ? convergenceSummary(target.label, groupsRes, ev, groupsRes.groups.length >= 2 ? snvReason : null) : null;
  const totals = ev ? evidenceTotals(ev) : null;

  const isolate = () => {
    const ids = ev.sites.map((s) => s.id);
    dispatch(singleCellActions.updateHeatmapType("snv"));
    dispatch(singleCellActions.updateLayout({ snvSelected: ids, snvSelectedOnly: true, snvIsolate: true }));
    dispatch(singleCellActions.updateSelection(groupsRes.carrierIds));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const zoomCn = () => {
    dispatch(singleCellActions.updateHeatmapType("cn"));
    dispatch(settingsActions.updateDomains([cnStrip.domain]));
    dispatch(singleCellActions.updateSelection(groupsRes.carrierIds));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const options = [
    { label: "Filtered events (most carrier groups first)", options: eventCands.slice(0, 80).map((c) => ({ value: `ev:${c.key}`, label: `${c.label} · ${c.nGroups} group${c.nGroups === 1 ? "" : "s"}${c.sizes.length ? ` (${c.sizes.join(", ")})` : ""} · ${c.carriers} carriers` })) },
    { label: "Copy-number calls hitting ≥ 2 clades", options: cnCands },
  ];
  const specValue = serializeConvSpec(spec);
  if (specValue && !options.some((g) => g.options.some((o) => o.value === specValue))) options.unshift({ label: "Current", options: [{ value: specValue, label: spec.kind === "cn" ? cnSpecLabel(spec) : spec.key }] });

  if (!open)
    return (
      <Card size="small" id="sc-convergence-panel" title={<Space><BranchesOutlined />Convergent evolution</Space>} extra={<Button size="small" onClick={() => setOpen(true)}>Open</Button>}>
        <Text type="secondary">Pick an event to see its carrier groups on the tree and the SNVs that show whether it arose more than once.</Text>
      </Card>
    );

  return (
    <Card
      size="small"
      id="sc-convergence-panel"
      title={<Space><BranchesOutlined />Convergent evolution: isolate the SNVs that show an event arose more than once</Space>}
      extra={<Button size="small" icon={<CloseOutlined />} onClick={() => { setOpen(false); pick(null); }} />}
    >
      <div ref={ref}>
        <Space direction="vertical" style={{ width: "100%" }} size="small">
          <Space wrap>
            <Text>Event</Text>
            <Select showSearch size="small" style={{ minWidth: 420 }} placeholder="Pick an event" value={specValue || undefined} options={options} optionFilterProp="label" onChange={(v) => pick(parseConvSpec(v))} />
          </Space>
          <Space wrap>
            <Text type="secondary">CN region</Text>
            <Input size="small" style={{ width: 260 }} placeholder="15q, chr15, chr4:54000000-56000000, PDGFRA" value={custom.region} onChange={(e) => setCustom({ ...custom, region: e.target.value })} />
            <Select size="small" value={custom.dir} onChange={(dir) => setCustom({ ...custom, dir })} options={[{ value: "loss", label: "loss" }, { value: "gain", label: "gain / amp" }]} style={{ width: 100 }} />
            <Select size="small" value={custom.rule} onChange={(rule) => setCustom({ ...custom, rule })} options={[{ value: "delta", label: "vs cell baseline (±)" }, { value: "abs", label: "absolute CN" }]} style={{ width: 160 }} />
            <InputNumber size="small" value={custom.thr} step={0.25} onChange={(thr) => setCustom({ ...custom, thr: thr ?? 0 })} style={{ width: 80 }} />
            <Button size="small" disabled={!custom.region.trim()} onClick={() => pick({ kind: "cn", ...custom, region: custom.region.trim() })}>Apply</Button>
          </Space>
          <Space wrap size="small">
            <Tooltip title="A carrier group may hold up to this fraction of non-carriers (and a non-carrier clade this fraction of carriers)">
              <Text type="secondary">Tolerance</Text>
            </Tooltip>
            <InputNumber size="small" min={0} max={0.45} step={0.05} value={opts.tolerance} onChange={(v) => setOpts({ ...opts, tolerance: v ?? 0.2 })} style={{ width: 70 }} />
            <Text type="secondary">min cells</Text>
            <InputNumber size="small" min={2} max={50} value={opts.minCells} onChange={(v) => setOpts({ ...opts, minCells: v ?? 3 })} style={{ width: 60 }} />
            <Tooltip title="Present: alt reads in at least this fraction of the covered cells of a set">
              <Text type="secondary">present ≥</Text>
            </Tooltip>
            <InputNumber size="small" min={0.1} max={1} step={0.05} value={opts.presentFrac} onChange={(v) => setOpts({ ...opts, presentFrac: v ?? 0.5 })} style={{ width: 70 }} />
            <Tooltip title="Absent: alt reads in at most this fraction of the covered cells">
              <Text type="secondary">absent ≤</Text>
            </Tooltip>
            <InputNumber size="small" min={0} max={0.3} step={0.01} value={opts.absentFrac} onChange={(v) => setOpts({ ...opts, absentFrac: v ?? 0.05 })} style={{ width: 70 }} />
            <Text type="secondary">covered cells (present / absent)</Text>
            <InputNumber size="small" min={1} max={50} value={opts.minCovered} onChange={(v) => setOpts({ ...opts, minCovered: v ?? 3 })} style={{ width: 60 }} />
            <InputNumber size="small" min={1} max={50} value={opts.minCoveredAbsent} onChange={(v) => setOpts({ ...opts, minCoveredAbsent: v ?? 5 })} style={{ width: 60 }} />
          </Space>
          {!spec && <Text type="secondary">Pick an event above (or a CN region) to see its carrier groups.</Text>}
          {target?.error && <Alert type="warning" showIcon message={`Not available (${target.error}).`} />}
          {summary && <Alert type={groupsRes.groups.length >= 2 ? "info" : "warning"} showIcon message={<Text strong>{summary}</Text>} />}
          {groupsRes && groupsRes.groups.length > 0 && (
            <Space wrap size={[6, 4]}>
              {groupsRes.groups.map((g, i) => (
                <Tag key={g.node} color={GROUP_COLORS[i % GROUP_COLORS.length]} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection(g.ids))}>
                  {`${g.name}: ${g.carriers} carriers / ${g.n} cells`}
                </Tag>
              ))}
              {groupsRes.scattered > 0 && <Tag color={SCATTERED}>{`${groupsRes.scattered} carriers outside groups`}</Tag>}
              <Tag>{`${groupsRes.nonCarrierIds.length} non-carrier tumour cells in ${groupsRes.clades.length} clades`}</Tag>
              {groupsRes.between.map((b) => (
                <Text key={`${b.i}-${b.j}`} type="secondary">{`${groupsRes.groups[b.i].name}–${groupsRes.groups[b.j].name}: ${b.nonCarriers} non-carriers in their common clade`}</Text>
              ))}
            </Space>
          )}
          {ev && (
            <Space wrap>
              <Button size="small" type="primary" disabled={!ev.sites.length} onClick={isolate}>{`Isolate the ${ev.sites.length} evidence SNVs on the heatmap`}</Button>
              {cnStrip && <Button size="small" onClick={zoomCn}>CN heatmap at the event</Button>}
              <Text type="secondary">{`${totals.split} site-pair calls place a group with non-carriers apart from another group; ${totals.shared} are shared by carrier groups only. Alternative to independent origins: the event arose once and was lost in the non-carriers between the groups.`}</Text>
            </Space>
          )}
          {!ev && cnStrip && groupsRes?.groups.length > 0 && <Button size="small" onClick={zoomCn}>CN heatmap at the event</Button>}
          {groupsRes && treeLayout && (
            <ConvergenceFigure layout={treeLayout} groupsRes={groupsRes} carriers={target.carriers} normals={normals} cnStrip={cnStrip} snv={ev ? snv.data : null} sites={shownSites} width={width} />
          )}
          {ev && ev.sites.length > shownSites.length && <Text type="secondary">{`Figure shows the ${shownSites.length} clearest of ${ev.sites.length} evidence SNVs; the table lists all.`}</Text>}
          {ev && ev.sites.length > 0 && (
            <Table
              size="small"
              rowKey="id"
              dataSource={ev.sites}
              pagination={{ pageSize: 10, size: "small" }}
              columns={[
                { title: "SNV", dataIndex: "id", render: (id) => <Text code>{id}</Text> },
                { title: "Pattern", dataIndex: "group", filters: [...new Set(ev.sites.map((s) => s.group))].map((g) => ({ text: g, value: g })), onFilter: (v, r) => r.group === v },
                { title: "alt in first group", key: "fi", render: (_, r) => `${pct(r.fi)} of ${r.ci}` },
                { title: "alt in second group", key: "fj", render: (_, r) => `${pct(r.fj)} of ${r.cj}` },
                { title: "alt in non-carriers", key: "fk", render: (_, r) => `${pct(r.fk)} of ${r.ck}${r.k >= 0 ? ` (${groupsRes.clades[r.k].name})` : " (all)"}` },
                { title: "Score", dataIndex: "score", sorter: (a, b) => a.score - b.score, render: (x) => x.toFixed(2) },
              ]}
            />
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            Carrier groups: maximal tree clades of ≥ min cells whose tumour cells are carriers up to the tolerance; normal cells left out. Evidence SNV for (Gi, Gj): alt in ≥ present of the covered cells of Gi and of a non-carrier clade, and ≤ absent in Gj (enough covered cells). Shared-only SNVs: present in Gi and Gj, absent from all non-carriers. Sites mapped outside the tumour are dropped; the SNV heatmap site filters (tree site, CellPhy, clade F1, annotation filters) apply.
          </Text>
        </Space>
      </div>
    </Card>
  );
}
