import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Card, Col, Empty, Input, Row, Segmented, Space, Spin, Table, Tooltip, Typography } from "antd";
import NeutralTag, { DataSwatch } from "../neutralTag";
import { SwapOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import {
  ASE_CLASS,
  ASE_CLASS_FILL,
  aseHeadline,
  aseIgvView,
  aseSliceCount,
  cellPattern,
  cellsByClone,
  filterGenes,
  geneCells,
  isNotableAse,
  parseAse,
  pctText,
  qText,
  scatterGenes,
} from "../../../helpers/singleCell/ase";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import useContainerWidth from "../useContainerWidth";
import { RefLine, XAxis, YAxis, linearScale, useChartText } from "../chartAxes";
import SvgExportButton from "../svgExportButton";
import HintLine, { Provenance } from "../hintLine";
import CellIgvPanel from "../cellIgvPanel";
import { SC_GUTTER } from "../density";

const { Text, Link } = Typography;
const k = "components.single-cell.ase";
const NO_CLONE = "#8c8c8c";
const cache = new Map();

/** data/<patient>/rna/ase.json, fetched once per dataset + patient: { status, data }. */
export function useAse() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patientId = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    if (!dataset || !patientId) return undefined;
    const key = `${dataset.dataPath}|${patientId}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        tryGet(casePath(dataset, patientId, "rna/ase.json"))
          .then((r) => (r.status === "ok" ? { status: "ok", data: parseAse(r.data) } : r))
          .catch((error) => ({ status: "error", error }))
      );
    }
    let live = true;
    setState({ status: "loading" });
    cache.get(key).then((r) => live && setState(r.status === "ok" && !r.data ? { status: "missing" } : r));
    return () => {
      live = false;
    };
  }, [dataset, patientId]);
  return { ...state, patientId };
}

/** Ranked findings as sentences; click picks the gene, "reads" opens the RNA reads at its SNPs. */
function AseFindingsList({ ase, patientId, picked, onPick }) {
  const { t } = useTranslation("common");
  const [showAll, setShowAll] = useState(false);
  const [igvId, setIgvId] = useState(null);
  const notable = ase.findings.filter(isNotableAse);
  const rest = ase.findings.filter((f) => !isNotableAse(f));
  const shown = showAll ? ase.findings : notable.length ? notable.slice(0, 12) : ase.findings.slice(0, 6);
  const hidden = ase.findings.length - shown.length;
  const igvFinding = ase.findings.find((f) => f.id === igvId);
  const igvView = igvFinding ? aseIgvView(igvFinding, ase, patientId) : null;
  return (
    <Space direction="vertical" size={2} style={{ width: "100%" }} data-testid="ase-findings">
      <Space size={4}>
        <SwapOutlined />
        <Text strong>{t(`${k}.findings-title`)}</Text>
        <HintLine inline text={t(`${k}.findings-help`)} />
      </Space>
      {!ase.findings.length && <Text type="secondary">{t(`${k}.findings-none`)}</Text>}
      {shown.map((f, i) => {
        const nSlices = aseSliceCount(f, ase);
        return (
          <div key={f.id} style={{ fontSize: TYPE.label, lineHeight: 1.6, opacity: isNotableAse(f) ? 1 : 0.78, background: picked === f.gene ? INK.selectFill : undefined, borderRadius: 4, padding: "0 4px" }} data-finding={f.id}>
            <Text type="secondary" style={{ fontSize: TYPE.tick, marginInlineEnd: 6 }}>{i + 1}.</Text>
            <NeutralTag strong={f.severity === "high"} style={{ fontSize: TYPE.tick }}>
              {t(`${k}.severity-${f.severity}`)}
            </NeutralTag>
            <DataSwatch color={ASE_CLASS_FILL[f.kind] || ASE_CLASS_FILL.none} style={{ fontSize: TYPE.tick, marginInlineEnd: 6 }}>
              {t(`${k}.kind-${f.kind}`)}
            </DataSwatch>
            <Link onClick={() => onPick(f.gene)} style={{ fontSize: TYPE.label }}>
              {f.text}
            </Link>
            {(f.flags || []).length > 0 && <Text type="secondary" style={{ fontSize: TYPE.tick }}>{` [${f.flags.join("; ")}]`}</Text>}
            {" · "}
            {nSlices > 0 ? (
              <Link style={{ fontSize: TYPE.tick }} onClick={() => setIgvId((id) => (id === f.id ? null : f.id))} strong={igvId === f.id}>
                {t(`${k}.reads`)}
              </Link>
            ) : (
              <Tooltip title={t(`${k}.reads-none`)}>
                <Text type="secondary" style={{ fontSize: TYPE.tick }} delete>
                  {t(`${k}.reads`)}
                </Text>
              </Tooltip>
            )}
          </div>
        );
      })}
      {hidden > 0 && (
        <Link style={{ fontSize: TYPE.tick }} onClick={() => setShowAll(true)}>
          {t(`${k}.show-more`, { count: hidden })}
        </Link>
      )}
      {showAll && rest.length > 0 && (
        <Link style={{ fontSize: TYPE.tick }} onClick={() => setShowAll(false)}>
          {t(`${k}.show-less`)}
        </Link>
      )}
      {igvView && <CellIgvPanel view={igvView} embedded />}
    </Space>
  );
}

const SM = { top: 18, right: 14, bottom: 50, left: 58 };
const pctTick = (v) => `${Math.round(v * 100)}%`;

/** Every informative gene: DNA share of the major haplotype (x) vs RNA share of it (y); click picks a gene. */
function AseScatter({ ase, width, picked, onPick }) {
  const { t } = useTranslation("common");
  const txt = useChartText();
  const pts = useMemo(() => scatterGenes(ase), [ase]);
  const height = Math.round(Math.min(380, Math.max(280, width * 0.82)));
  const w = width - SM.left - SM.right;
  const h = height - SM.top - SM.bottom;
  const x = linearScale([0.5, 1], [0, w], { clamp: true });
  const y = linearScale([0, 1], [h, 0], { clamp: true });
  const maxReads = Math.max(20, ...pts.map((p) => p.reads));
  const r = (n) => 2 + 4.5 * Math.sqrt(Math.log10(1 + n) / Math.log10(1 + maxReads));
  const labelled = new Set(ase.findings.filter(isNotableAse).slice(0, 8).map((f) => f.gene));
  if (picked) labelled.add(picked);
  // called genes drawn last (on top)
  const drawn = [...pts].sort((a, b) => (b.cls === "none") - (a.cls === "none"));
  return (
    <svg width={width} height={height} role="img" aria-label={t(`${k}.scatter-title`)} style={{ display: "block" }}>
      <g transform={`translate(${SM.left},${SM.top})`}>
        <YAxis scale={y} x0={0} x1={w} ticks={5} format={pctTick} title={t(`${k}.scatter-y`)} />
        <XAxis scale={x} y0={h} y1={0} values={[0.5, 0.6, 0.7, 0.8, 0.9, 1]} format={pctTick} title={t(`${k}.scatter-x`)} />
        <RefLine x1={0} x2={w} y1={y(0.5)} y2={y(0.5)} opacity={0.6} />
        {/* RNA = DNA: imbalance explained by copy number */}
        <RefLine x1={x(0.5)} x2={x(1)} y1={y(0.5)} y2={y(1)} />
        <text x={x(0.97)} y={y(0.97) + 14} textAnchor="end" {...txt.caption}>{t(`${k}.scatter-diagonal`)}</text>
        <text x={4} y={12} {...txt.caption}>{t(`${k}.scatter-top`)}</text>
        <text x={4} y={h - 6} {...txt.caption}>{t(`${k}.scatter-bottom`)}</text>
        {drawn.map((p) => {
          const isPicked = p.gene === picked;
          const called = p.cls !== "none";
          return (
            <circle
              key={p.gene}
              cx={x(p.x)}
              cy={y(p.y)}
              r={isPicked ? r(p.reads) + 2 : r(p.reads)}
              fill={ASE_CLASS_FILL[p.cls] || ASE_CLASS_FILL.none}
              fillOpacity={called ? 0.85 : 0.22}
              stroke={isPicked ? INK.text : p.switch ? ASE_CLASS_FILL["clone-switch"] : "none"}
              strokeWidth={isPicked ? 2 : 1.2}
              style={{ cursor: "pointer" }}
              onClick={() => onPick(p.gene)}
            >
              <title>{`${p.gene}: DNA ${pctText(p.x)} · RNA ${pctText(p.y)} of the same haplotype · ${p.reads} reads${called ? ` · ${ASE_CLASS[p.cls]?.label || p.cls}` : ""} · ${qText(p.q)}`}</title>
            </circle>
          );
        })}
        {drawn
          .filter((p) => labelled.has(p.gene))
          .map((p) => (
            <text key={`l${p.gene}`} x={x(p.x) + r(p.reads) + 3} y={y(p.y)} dy="0.35em" {...txt.tick} fill={INK.text} fontWeight={p.gene === picked ? 700 : 500} style={{ paintOrder: "stroke", stroke: INK.labelBg, strokeWidth: 3, pointerEvents: "none" }}>
              {p.gene}
            </text>
          ))}
      </g>
    </svg>
  );
}

const CM = { top: 30, right: 12, bottom: 44, left: 58 };

/**
 * One gene, every cell: RNA share of haplotype A (dot, size = reads, colour =
 * clone) and the share expected from that cell's allelic copy number (dash);
 * cells grouped by clone with the clone's pooled RNA share (solid) and DNA
 * expectation (dashed). Click a dot to select the cell.
 */
function AseCellPlot({ gene, cells, width, cloneColors, selected, hovered, onSelect, onHover }) {
  const { t } = useTranslation("common");
  const txt = useChartText();
  const { order, groups } = useMemo(() => cellsByClone(cells), [cells]);
  const height = 280;
  const w = width - CM.left - CM.right;
  const h = height - CM.top - CM.bottom;
  const gap = 10;
  const step = order.length ? Math.max(2, (w - gap * (groups.length - 1)) / order.length) : 1;
  const groupOf = new Map();
  groups.forEach((g, gi) => {
    for (let i = g.from; i <= g.to; i += 1) groupOf.set(i, gi);
  });
  const cx = (i) => i * step + (groupOf.get(i) || 0) * gap + step / 2;
  const y = linearScale([0, 1], [h, 0], { clamp: true });
  const maxN = Math.max(4, ...cells.map((c) => c.n));
  const rad = (n) => 2 + 4 * Math.sqrt(n / maxN);
  const yFmt = (v) => (v === 1 ? "A only" : v === 0 ? "B only" : pctTick(v));
  return (
    <svg width={width} height={height} role="img" aria-label={t(`${k}.cells-aria`, { gene })} style={{ display: "block" }}>
      <g transform={`translate(${CM.left},${CM.top})`}>
        <YAxis scale={y} x0={0} x1={w} ticks={5} format={yFmt} title={t(`${k}.cells-y`)} />
        <RefLine x1={0} x2={w} y1={y(0.5)} y2={y(0.5)} opacity={0.6} />
        {groups.map((g) => {
          const x0 = cx(g.from) - step / 2;
          const x1 = cx(g.to) + step / 2;
          const col = cloneColors[g.clone] || NO_CLONE;
          return (
            <g key={g.clone}>
              <rect x={x0} y={-CM.top + 4} width={Math.max(2, x1 - x0)} height={4} fill={col} />
              <text x={(x0 + x1) / 2} y={-CM.top + 21} textAnchor="middle" {...txt.tick}>
                {x1 - x0 > 110 ? `${g.clone} · RNA ${pctText(g.rna)}${Number.isFinite(g.dna) ? ` / DNA ${pctText(g.dna)}` : ""}` : x1 - x0 > 26 ? g.clone.replace(/^Clone\s*/i, "C") : ""}
                <title>{`${g.clone}: ${g.cells} cells, ${g.a} A / ${g.b} B reads, RNA ${pctText(g.rna)} (95% CI ${pctText(g.ci[0])}–${pctText(g.ci[1])}), DNA ${pctText(g.dna)}`}</title>
              </text>
              {Number.isFinite(g.rna) && <line x1={x0} x2={x1} y1={y(g.rna)} y2={y(g.rna)} stroke={col} strokeWidth={2.5} strokeOpacity={0.9} />}
              {Number.isFinite(g.dna) && <line x1={x0} x2={x1} y1={y(g.dna)} y2={y(g.dna)} stroke={INK.text} strokeWidth={1.5} strokeDasharray="5 3" />}
            </g>
          );
        })}
        {order.map((c) => {
          const isSel = selected.has(c.cellId);
          const isHov = hovered === c.cellId;
          return (
            <g key={c.index}>
              {Number.isFinite(c.exp) && <line x1={cx(c.x) - Math.max(2, step * 0.45)} x2={cx(c.x) + Math.max(2, step * 0.45)} y1={y(c.exp)} y2={y(c.exp)} stroke={INK.text} strokeOpacity={0.55} strokeWidth={1.2} />}
              <circle
                cx={cx(c.x)}
                cy={y(c.frac)}
                r={isHov ? rad(c.n) + 2 : rad(c.n)}
                fill={cloneColors[c.clone] || NO_CLONE}
                fillOpacity={selected.size && !isSel ? 0.3 : 0.85}
                stroke={isSel || isHov ? INK.text : INK.panel}
                strokeWidth={isHov ? 2 : 0.7}
                style={{ cursor: "pointer" }}
                onClick={(e) => onSelect([c.cellId], e.shiftKey || e.metaKey || e.ctrlKey)}
                onMouseEnter={() => onHover(c.cellId)}
                onMouseLeave={() => onHover(null)}
              >
                <title>{`${c.cellId} (${c.clone}): ${c.a} A / ${c.b} B reads · RNA ${pctText(c.frac)} A · DNA CN A ${Number.isFinite(c.cnA) ? +c.cnA.toFixed(1) : "–"} / B ${Number.isFinite(c.cnB) ? +c.cnB.toFixed(1) : "–"} → expected ${pctText(c.exp)}`}</title>
              </circle>
            </g>
          );
        })}
        <text x={w / 2} y={h + 22} textAnchor="middle" {...txt.head}>{t(`${k}.cells-x`, { count: order.length })}</text>
      </g>
    </svg>
  );
}

/** Stats line, per-cell plot, clone and SNP tables of the picked gene. */
function AseGeneDetail({ ase, gene, width }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cloneColors, selectedCellIds, hoveredCellId } = useSelector((s) => s.SingleCell);
  const selected = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const g = ase.byGene.get(gene);
  const cells = useMemo(() => geneCells(ase, gene), [ase, gene]);
  const pattern = useMemo(() => cellPattern(cells), [cells]);
  if (!g) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${k}.pick-gene`)} />;
  const cls = g.cls && ASE_CLASS[g.cls];
  const onSelect = (ids, add) => dispatch(singleCellActions.updateSelection(add ? [...new Set([...selectedCellIds, ...ids])] : ids));
  const onHover = (id) => dispatch(singleCellActions.updateHover(id));
  const snpCols = [
    { title: t(`${k}.snp-pos`), dataIndex: 0, key: "pos", render: (v) => `${g.chrom}:${Number(v).toLocaleString()}` },
    { title: t(`${k}.snp-alleles`), key: "al", render: (_, s) => `${s[1]}>${s[2]} · ${s[3] ? "alt on A" : "alt on B"}` },
    { title: "A", dataIndex: 4, key: "a", width: 56 },
    { title: "B", dataIndex: 5, key: "b", width: 56 },
    { title: t(`${k}.snp-share`), key: "f", width: 70, render: (_, s) => pctText(s[4] / Math.max(1, s[4] + s[5])) },
    { title: t(`${k}.snp-cells`), dataIndex: 6, key: "c", width: 60 },
  ];
  const cloneCols = [
    { title: t(`${k}.clone`), dataIndex: "clone", key: "clone", render: (c) => <span><span className="sc-swatch" style={{ background: cloneColors[c] || NO_CLONE }} />{c}</span> },
    { title: t(`${k}.cells`), dataIndex: "cells", key: "cells", width: 56 },
    { title: "A / B", key: "ab", width: 84, render: (_, c) => `${c.a} / ${c.b}` },
    { title: "RNA A", dataIndex: "rna", key: "rna", width: 64, render: pctText },
    { title: "DNA A", dataIndex: "dna", key: "dna", width: 64, render: pctText },
  ];
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Space wrap size={[8, 2]}>
        <Text strong style={{ fontSize: TYPE.title }}>{gene}</Text>
        {cls && <DataSwatch color={ASE_CLASS_FILL[g.cls]}>{cls.label}</DataSwatch>}
        {g.switch && <DataSwatch color={ASE_CLASS_FILL["clone-switch"]}>{t(`${k}.kind-clone-switch`)}</DataSwatch>}
        {(g.flags || []).map((f) => <NeutralTag key={f}>{f}</NeutralTag>)}
        {g.cancer && <NeutralTag strong>{t(`${k}.cancer-gene`)}</NeutralTag>}
        <Text type="secondary" style={{ fontSize: TYPE.label }}>
          {t(`${k}.gene-stats`, { rna: pctText(g.rna), dna: pctText(g.dna), q: qText(g.q), cells: g.cells, reads: g.reads, snps: g.snps })}
        </Text>
      </Space>
      {g.switch && (
        <Alert
          type={g.switch.dna_explained ? "info" : "warning"}
          showIcon
          message={t(g.switch.dna_explained ? `${k}.switch-dna` : `${k}.switch-cis`, { hi: g.switch.hi, lo: g.switch.lo, a: pctText(g.switch.rna_hi), b: pctText(1 - g.switch.rna_lo) })}
        />
      )}
      {cells.length ? (
        <>
          <AseCellPlot gene={gene} cells={cells} width={width} cloneColors={cloneColors} selected={selected} hovered={hoveredCellId} onSelect={onSelect} onHover={onHover} />
          <Text type="secondary" style={{ fontSize: TYPE.tick }}>
            {t(`${k}.pattern`, { a: pattern.onlyA, b: pattern.onlyB, both: pattern.both, total: pattern.total })}
          </Text>
        </>
      ) : (
        <Text type="secondary">{t(`${k}.no-cells`)}</Text>
      )}
      <Row gutter={SC_GUTTER}>
        <Col xs={24} xl={11}>
          <Table size="small" rowKey="clone" columns={cloneCols} dataSource={g.clones || []} pagination={false} tableLayout="fixed" />
        </Col>
        <Col xs={24} xl={13}>
          {g.snp_list ? (
            <Table size="small" rowKey={(s) => s[0]} columns={snpCols} dataSource={g.snp_list} pagination={g.snp_list.length > 6 ? { pageSize: 6, size: "small", showSizeChanger: false } : false} tableLayout="fixed" />
          ) : (
            <Text type="secondary">{t(`${k}.no-snps`)}</Text>
          )}
        </Col>
      </Row>
    </Space>
  );
}

/**
 * Allele-specific expression against allelic copy number in the same cells
 * (rna/ase.json): ranked findings first, then the genome-wide DNA-vs-RNA
 * scatter beside the picked gene's per-cell view, then the gene table.
 */
export default function AsePanel() {
  const { t } = useTranslation("common");
  const { status, data: ase, patientId } = useAse();
  const [containerRef, width] = useContainerWidth(1100);
  const [picked, setPicked] = useState(null);
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState("called");
  const detailRef = useRef(null);
  useEffect(() => {
    if (ase) setPicked((p) => (p && ase.byGene.has(p) ? p : ase.findings[0]?.gene || ase.genes[0]?.gene || null));
  }, [ase]);
  const rows = useMemo(() => (ase ? filterGenes(ase.genes, { query, cls }) : []), [ase, query, cls]);
  const pick = (gene) => {
    setPicked(gene);
    setTimeout(() => detailRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }), 80);
  };
  const title = (
    <Space>
      <SwapOutlined />
      {t(`${k}.title`)}
      <Provenance id="ase" />
    </Space>
  );
  if (status === "loading") return <Card size="small" title={title}><Spin size="small" /></Card>;
  if (status !== "ok" || !ase) {
    return (
      <Card size="small" title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${k}.missing`)} />
      </Card>
    );
  }
  const hl = aseHeadline(ase);
  const wide = width >= 1100;
  const scatterW = wide ? Math.floor(width * 0.36) : width;
  const detailW = wide ? width - scatterW - 24 : width;
  const columns = [
    { title: t(`${k}.col-gene`), dataIndex: "gene", key: "gene", width: 110, fixed: "left", render: (g) => <Link onClick={() => pick(g)} strong={g === picked}>{g}</Link> },
    { title: t(`${k}.col-class`), key: "cls", width: 150, render: (_, g) => <Space size={6} wrap>{g.cls && <DataSwatch color={ASE_CLASS_FILL[g.cls]}>{ASE_CLASS[g.cls]?.label || g.cls}</DataSwatch>}{g.switch && <DataSwatch color={ASE_CLASS_FILL["clone-switch"]}>switch</DataSwatch>}</Space> },
    { title: "RNA A", dataIndex: "rna", key: "rna", width: 70, render: pctText, sorter: (a, b) => a.rna - b.rna },
    { title: "DNA A", dataIndex: "dna", key: "dna", width: 70, render: pctText, sorter: (a, b) => (a.dna || 0) - (b.dna || 0) },
    { title: "Δ", dataIndex: "delta", key: "delta", width: 64, render: (v) => (Number.isFinite(v) ? v.toFixed(2) : "–"), sorter: (a, b) => Math.abs(a.delta || 0) - Math.abs(b.delta || 0) },
    { title: "q", dataIndex: "q", key: "q", width: 80, render: (v) => qText(v).replace(/^q /, ""), sorter: (a, b) => (Number.isFinite(a.q) ? a.q : 2) - (Number.isFinite(b.q) ? b.q : 2), defaultSortOrder: "ascend" },
    { title: t(`${k}.cells`), dataIndex: "cells", key: "cells", width: 64, sorter: (a, b) => a.cells - b.cells },
    { title: t(`${k}.col-reads`), dataIndex: "reads", key: "reads", width: 70, sorter: (a, b) => a.reads - b.reads },
    { title: "SNPs", dataIndex: "snps", key: "snps", width: 60 },
  ];
  return (
    <Card size="small" title={title} extra={<SvgExportButton containerRef={containerRef} name={`ase-${picked || "genes"}`} />} data-testid="ase-panel">
      <div ref={containerRef}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Text style={{ fontSize: TYPE.body }}>
            {t(`${k}.headline`, { cells: hl.cells, genes: hl.genes, beyond: hl.beyond, dosage: hl.dosage, buffered: hl.buffered, switches: hl.switches, reads: Math.round(hl.readsPerCell) })}
          </Text>
          <AseFindingsList ase={ase} patientId={patientId} picked={picked} onPick={pick} />
          <Row gutter={SC_GUTTER}>
            <Col span={wide ? undefined : 24} flex={wide ? `${scatterW}px` : undefined}>
              <Text strong>{t(`${k}.scatter-title`)}</Text>
              <HintLine text={t(`${k}.scatter-help`)} />
              <AseScatter ase={ase} width={scatterW} picked={picked} onPick={pick} />
              <Space wrap size={[10, 2]} style={{ fontSize: TYPE.tick, marginTop: 4 }}>
                {Object.entries(ASE_CLASS).filter(([key]) => key !== "monoallelic-nodna").map(([key, v]) => (
                  <span key={key}><span className="sc-swatch" style={{ background: ASE_CLASS_FILL[key] }} />{v.label}</span>
                ))}
                <span><span className="sc-swatch" style={{ background: ASE_CLASS_FILL.none, opacity: 0.4 }} />{t(`${k}.legend-none`)}</span>
              </Space>
            </Col>
            <Col span={wide ? undefined : 24} flex={wide ? "auto" : undefined}>
              <div ref={detailRef}>
                {picked ? <AseGeneDetail ase={ase} gene={picked} width={detailW} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${k}.pick-gene`)} />}
              </div>
            </Col>
          </Row>
          <Space wrap>
            <Text strong>{t(`${k}.table-title`, { count: rows.length })}</Text>
            <Segmented
              size="small"
              value={cls}
              onChange={setCls}
              options={[
                { value: "called", label: t(`${k}.filter-called`) },
                { value: "monoallelic", label: ASE_CLASS.monoallelic.label },
                { value: "beyond-dna", label: ASE_CLASS["beyond-dna"].label },
                { value: "dosage", label: ASE_CLASS.dosage.label },
                { value: "switch", label: t(`${k}.kind-clone-switch`) },
                { value: "all", label: t(`${k}.filter-all`) },
              ]}
            />
            <Input.Search size="small" allowClear placeholder={t(`${k}.search`)} style={{ width: 180 }} value={query} onChange={(e) => setQuery(e.target.value)} />
          </Space>
          <Table size="small" rowKey="gene" columns={columns} dataSource={rows} tableLayout="fixed" scroll={{ x: 760 }} pagination={{ pageSize: 10, size: "small", showSizeChanger: false }} onRow={(g) => ({ onClick: () => pick(g.gene), style: { cursor: "pointer" } })} />
          <HintLine text={t(`${k}.caveats`, { snps: ase.summary?.n_snps || 0 })} />
        </Space>
      </div>
    </Card>
  );
}
