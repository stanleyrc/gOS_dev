import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { Alert, Card, Col, Row, Segmented, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import igv from "../../../../node_modules/igv/dist/igv.esm.min.js";
import singleCellActions from "../../../redux/singleCell/actions";
import { casePath } from "../../../redux/singleCell/loaders";
import { siteCloneSummary, siteEvidence } from "../../../helpers/singleCell/precompute";
import NotComputed, { pcFile } from "./notComputed";
import { Provenance } from "../hintLine";
import ColorTag from "../colorTag";

const { Text } = Typography;
const WINDOW = 60;
const CALL_COLORS = { mut: "#d4380d", wt: "#389e0d", nc: "#8c8c8c" };
const CALL_LABEL = { mut: "mutant", wt: "wild type", nc: "no call" };

let genomeListPromise = null;
const loadGenomeList = () => {
  if (!genomeListPromise) {
    genomeListPromise = axios.get("igvGenomes.json").then((r) => r.data);
    genomeListPromise.catch(() => (genomeListPromise = null));
  }
  return genomeListPromise;
};
const chr = (c) => (`${c}`.startsWith("chr") ? `${c}` : `chr${c}`);

/** Sites to browse: genotyped sites from region_calls.json, then junctions and RNA fusions from slices/regions.json. */
function siteOptions(calls, slices) {
  const out = [];
  (calls?.sites || []).forEach((s) =>
    out.push({
      value: `site:${s.id}`,
      group: s.hotspot ? "Hotspots" : "Discovered sites (PASS)",
      label: `${s.name || s.id}${s.n_mut ? ` · ${s.n_mut} mutant` : ""}${s.filter && s.filter !== "PASS" ? ` · ${s.filter}` : ""}`,
      loci: [{ chrom: s.chrom, pos: s.pos }],
      siteId: s.id,
      set: "drivers",
    })
  );
  (slices?.sets?.junctions?.junctions || []).forEach((j) =>
    out.push({
      value: `jun:${j.name}`,
      group: "SV junctions (DNA)",
      label: j.name,
      loci: [{ chrom: j.chrom1, pos: j.pos1 }, { chrom: j.chrom2, pos: j.pos2 }],
      set: "junctions",
    })
  );
  (slices?.sets?.rna_fusions?.fusions || []).forEach((f) => {
    const [c1, p1] = `${f.bp1}`.split(":");
    const [c2, p2] = `${f.bp2}`.split(":");
    out.push({
      value: `fus:${f.fusion}`,
      group: "RNA fusions",
      label: `${f.fusion} · ${f.n_cells} cells`,
      loci: [{ chrom: c1, pos: +p1 }, { chrom: c2, pos: +p2 }],
      set: "rna_fusions",
    });
  });
  return out;
}

/**
 * Read-level evidence from the per-patient slice BAMs (reads tagged RG = cell):
 * one alignment track per clone (DNA, and RNA when sliced), optionally only the
 * selected cells, beside the per-cell genotype at the site from the targeted
 * caller: alt / total reads, P(mutant), call and the chance a mutant cell would
 * show no alt reads at that depth ("not detected" is not "absent").
 */
export default function ReadSlicePanel() {
  const dispatch = useDispatch();
  const { cells, cloneColors, order, patient, selectedCellIds, precompute } = useSelector((s) => s.SingleCell);
  const dataset = useSelector((s) => s.Settings.dataset);
  const calls = pcFile(precompute, "calls");
  const slices = pcFile(precompute, "slices");
  const options = useMemo(() => siteOptions(calls.data, slices.data), [calls.data, slices.data]);
  const [choice, setChoice] = useState(null);
  const [onlySelected, setOnlySelected] = useState(false);
  const [layers, setLayers] = useState("DNA + RNA");
  const [groupByCell, setGroupByCell] = useState(false);
  const containerRef = useRef(null);
  const browserRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!choice && options.length) {
      const firstMut = options.find((o) => o.siteId && /mutant/.test(o.label));
      setChoice((firstMut || options[0]).value);
    }
  }, [options, choice]);
  const opt = options.find((o) => o.value === choice);

  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const cloneOrder = useMemo(() => {
    const seen = [];
    order.forEach((id) => {
      const k = cloneOf.get(`${id}`);
      if (k != null && !seen.includes(k)) seen.push(k);
    });
    return seen;
  }, [order, cloneOf]);
  const selected = useMemo(() => new Set(selectedCellIds.map(String)), [selectedCellIds]);

  const rows = useMemo(
    () => (opt?.siteId ? siteEvidence(calls.data, opt.siteId, cloneOf, cloneOrder) : []),
    [opt, calls.data, cloneOf, cloneOrder]
  );
  const summary = useMemo(() => siteCloneSummary(rows), [rows]);
  const site = opt?.siteId ? (calls.data?.sites || []).find((s) => s.id === opt.siteId) : null;

  const files = slices.data?.sets?.[opt?.set] || {};
  const dnaFile = opt?.set === "rna_fusions" ? null : files.dna;
  const rnaFile = opt?.set === "junctions" ? null : files.rna || slices.data?.sets?.drivers?.rna;
  const locus = opt ? opt.loci.map((l) => `${chr(l.chrom)}:${Math.max(1, l.pos - WINDOW)}-${l.pos + WINDOW}`).join(" ") : null;

  const tracks = useMemo(() => {
    if (!opt || !patient || !dataset) return [];
    const out = [];
    const add = (file, kind) => {
      if (!file) return;
      cloneOrder.forEach((clone) => {
        const ids = cells.filter((c) => (c.clone_id ?? "unassigned") === clone).map((c) => `${c.cell_id}`);
        const keep = new Set(onlySelected ? ids.filter((id) => selected.has(id)) : ids);
        if (!keep.size) return;
        out.push({
          id: `${kind}|${clone}`,
          name: `${kind} · ${clone} (${keep.size} cells)`,
          url: casePath(dataset, patient.caseReportId, `slices/${file}`),
          indexURL: casePath(dataset, patient.caseReportId, `slices/${file}.bai`),
          format: "bam",
          type: "alignment",
          height: 150,
          displayMode: "SQUISHED",
          color: cloneColors[clone] || undefined,
          filter: (al) => keep.has(al.tags().RG),
          ...(groupByCell ? { groupBy: "tag:RG" } : {}),
          showSoftClips: true,
          ...(opt.loci.length === 1 ? { sort: { chr: chr(opt.loci[0].chrom), position: opt.loci[0].pos, option: "BASE", direction: "DESC" } } : {}),
        });
      });
    };
    if (layers !== "RNA") add(dnaFile, "DNA");
    if (layers !== "DNA") add(rnaFile, "RNA");
    return out;
  }, [opt, patient, dataset, cloneOrder, cells, onlySelected, selected, cloneColors, groupByCell, layers, dnaFile, rnaFile]);
  const trackKey = tracks.map((t) => t.name).join("|") + (groupByCell ? "|g" : "");

  useEffect(() => {
    if (!locus || !containerRef.current) return undefined;
    let cancelled = false;
    const run = async () => {
      try {
        setError(null);
        if (browserRef.current) {
          igv.removeBrowser(browserRef.current);
          browserRef.current = null;
        }
        if (!tracks.length) return;
        const genomeList = await loadGenomeList();
        if (cancelled) return;
        const reference = dataset?.reference || "hg38";
        const entry = (genomeList || []).find((g) => g.id === reference);
        browserRef.current = await igv.createBrowser(containerRef.current, {
          genome: entry ? { ...entry, tracks: [] } : reference,
          loadDefaultGenomes: false,
          locus,
          tracks,
          showCenterGuide: true,
          minimumBases: 1,
        });
      } catch (e) {
        if (!cancelled) setError(e?.message || `${e}`);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locus, trackKey]);
  useEffect(
    () => () => {
      if (browserRef.current) igv.removeBrowser(browserRef.current);
    },
    []
  );

  if (!slices.ok) return <NotComputed what="Read slices" step="regions / slices_dna" status={slices.status} />;

  const toggle = (id) => {
    const next = selected.has(id) ? selectedCellIds.filter((c) => `${c}` !== id) : [...selectedCellIds, id];
    dispatch(singleCellActions.updateSelection(next));
  };
  const columns = [
    {
      title: "Cell",
      dataIndex: "id",
      width: 160,
      fixed: "left",
      ellipsis: true,
      render: (id) => (
        <Text style={{ fontSize: 13, whiteSpace: "nowrap" }} strong={selected.has(id)} title={id}>
          {id}
        </Text>
      ),
    },
    {
      title: "Clone",
      dataIndex: "clone",
      width: 96,
      render: (c) => <ColorTag color={cloneColors[c]}>{c}</ColorTag>,
    },
    {
      title: "DNA alt / total",
      key: "dna",
      width: 136,
      sorter: (a, b) => (a.alt ?? -1) - (b.alt ?? -1),
      render: (_, r) => (r.dp == null ? "–" : `${r.alt} / ${r.dp}`),
    },
    {
      title: "P(mutant)",
      dataIndex: "p",
      width: 108,
      sorter: (a, b) => (a.p ?? -1) - (b.p ?? -1),
      render: (p) => (p == null ? "–" : p.toFixed(2)),
    },
    {
      title: "Call",
      dataIndex: "call",
      width: 90,
      filters: Object.entries(CALL_LABEL).map(([value, text]) => ({ value, text })),
      onFilter: (v, r) => r.call === v,
      render: (c) => <Tag color={CALL_COLORS[c]}>{CALL_LABEL[c] || c}</Tag>,
    },
    {
      title: (
        <Tooltip title="Chance a mutant cell would show no alt reads at this depth, given the cell's allelic dropout. High = a wild-type or no-call here is weak evidence.">
          Miss if mutant
        </Tooltip>
      ),
      dataIndex: "miss",
      width: 130,
      sorter: (a, b) => (a.miss ?? 2) - (b.miss ?? 2),
      render: (m) =>
        m == null ? "–" : (
          <span style={{ display: "inline-block", minWidth: 48, padding: "0 4px", background: `rgba(140,140,140,${0.15 + 0.6 * m})` }}>
            {m.toFixed(2)}
          </span>
        ),
    },
    {
      title: "RNA alt / total",
      key: "rna",
      width: 110,
      render: (_, r) => (r.rnaDp == null ? "–" : `${r.rnaAlt} / ${r.rnaDp}`),
    },
  ];

  return (
    <Card
      size="small"
      title={<span>Read evidence <Provenance id="readSlices" /></span>}
      extra={
        <Space wrap size="small">
          <Segmented size="small" options={["DNA + RNA", "DNA", "RNA"]} value={layers} onChange={setLayers} />
          <Space size={4}>
            <Switch size="small" checked={onlySelected} onChange={setOnlySelected} disabled={!selectedCellIds.length} />
            <Text style={{ fontSize: 13 }}>selected cells only ({selectedCellIds.length})</Text>
          </Space>
          <Space size={4}>
            <Switch size="small" checked={groupByCell} onChange={setGroupByCell} />
            <Text style={{ fontSize: 13 }}>group reads by cell</Text>
          </Space>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Select
          showSearch
          style={{ width: "100%", maxWidth: 640 }}
          value={choice}
          onChange={setChoice}
          optionFilterProp="label"
          options={[...new Set(options.map((o) => o.group))].map((g) => ({
            label: g,
            options: options.filter((o) => o.group === g).map((o) => ({ value: o.value, label: o.label })),
          }))}
        />
        {site && (
          <Space wrap size={[4, 4]}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {site.id} · {site.source || (site.hotspot ? "hotspot" : "discovered")} · covered in {site.cells_cov} of{" "}
              {rows.filter((r) => !/^normal$/i.test(`${r.clone || ""}`)).length} tumor cells · pooled tumor alt {site.alt_tumor}/{site.dp_tumor} · normal alt{" "}
              {site.alt_normal}/{site.dp_normal} · estimated prevalence {site.prevalence ?? "–"}
            </Text>
            {site.cells_cov != null && rows.length > 0 && site.cells_cov < 0.25 * rows.length && (
              <Tag color="warning">
                Sparse coverage (dropout): most cells have no reads here, so &quot;no call&quot; is the expected state, not wild type
              </Tag>
            )}
            {Object.entries(summary).map(([clone, s]) => (
              <ColorTag key={clone} color={cloneColors[clone]}>
                {clone}: {s.mut} mut · {s.wt} wt · {s.nc} no call
              </ColorTag>
            ))}
          </Space>
        )}
        {!calls.ok && opt?.siteId == null && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            Genotypes: not yet computed (precompute step caller).
          </Text>
        )}
        {error && <Alert type="error" showIcon message={error} />}
        <Row gutter={12}>
          <Col xs={24} xl={site ? 13 : 24}>
            <div ref={containerRef} className="sc-light-island" style={{ minHeight: 200 }} />
            {!tracks.length && <Text type="secondary">No reads to show for this choice.</Text>}
          </Col>
          {site && (
            <Col xs={24} xl={11}>
              <Table
                size="small"
                className="sc-nowrap-head"
                rowKey="id"
                dataSource={rows}
                columns={columns}
                pagination={{ pageSize: 25, size: "small" }}
                scroll={{ x: 880 }}
                onRow={(r) => ({
                  onClick: () => toggle(r.id),
                  style: { cursor: "pointer", background: selected.has(r.id) ? "rgba(24,144,255,0.12)" : undefined },
                })}
              />
            </Col>
          )}
        </Row>
      </Space>
    </Card>
  );
}
