import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Alert, Col, Row, Segmented, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import igv from "../../../helpers/singleCell/igvLazy";
import { casePath } from "../../../redux/singleCell/loaders";
import { readPasses } from "../../../helpers/singleCell/siteEvidence";
import { altFirstSort } from "../../../helpers/singleCell/igvTracks";
import ColorTag from "../colorTag";
import useContainerWidth from "../useContainerWidth";

const { Text } = Typography;
const WINDOW = 40;
const SIDE_BY_SIDE_PX = 1400; // IGV and the reads table share a row only when the panel is at least this wide

let genomeListPromise = null;
const loadGenomeList = () => {
  if (!genomeListPromise) {
    genomeListPromise = axios.get("igvGenomes.json").then((r) => r.data);
    genomeListPromise.catch(() => (genomeListPromise = null));
  }
  return genomeListPromise;
};
const chr = (c) => (`${c}`.startsWith("chr") ? `${c}` : `chr${c}`);
const ALLELE_COLOR = { alt: "red", ref: "blue", other: "orange", del: "default" };

/**
 * Read-level evidence at one site: pooled reads of the carrier cells, the other covered tumour cells and the
 * normal cells as three IGV tracks (slice BAM, RG = cell), with duplicate / MAPQ filters and strand colouring,
 * beside the per-read table from site_evidence.json (allele, strand, base and mapping quality, duplicate flag,
 * distance from the read end).
 */
export default function SiteReadsPanel({ site, cellRows, reads, dataset, patient, bamFile, cloneColors = {} }) {
  const [hideDup, setHideDup] = useState(true);
  const [minMq, setMinMq] = useState(20);
  const [colorBy, setColorBy] = useState("strand");
  const [alleleFilter, setAlleleFilter] = useState("alt");
  const containerRef = useRef(null);
  const browserRef = useRef(null);
  const [error, setError] = useState(null);
  const [wrapRef, panelWidth] = useContainerWidth(900);
  const sideBySide = panelWidth >= SIDE_BY_SIDE_PX;

  const groups = useMemo(() => {
    const normal = (c) => /^normal$/i.test(`${c.clone}`);
    const carriers = cellRows.filter((c) => !normal(c) && c.alt > 0).map((c) => c.id);
    const others = cellRows.filter((c) => !normal(c) && c.alt === 0 && c.dp > 0).map((c) => c.id);
    const normals = cellRows.filter((c) => normal(c) && c.dp > 0).map((c) => c.id);
    return [
      { key: "carriers", name: `Carrier cells (${carriers.length}): cells with an alt read`, ids: carriers, height: 220, color: "#cf1322" },
      { key: "others", name: `Other covered tumour cells (${others.length})`, ids: others, height: 150, color: "#1d39c4" },
      { key: "normals", name: `Normal cells (${normals.length} covered)`, ids: normals, height: 110, color: "#595959" },
    ].filter((g) => g.ids.length);
  }, [cellRows]);

  const locus = site ? `${chr(site.chrom)}:${Math.max(1, site.pos - WINDOW)}-${site.pos + WINDOW}` : null;
  const trackKey = `${site?.id}|${hideDup}|${minMq}|${colorBy}|${groups.map((g) => g.ids.length).join(",")}`;

  useEffect(() => {
    if (!locus || !containerRef.current || !bamFile || !patient) return undefined;
    let cancelled = false;
    const run = async () => {
      try {
        setError(null);
        if (browserRef.current) {
          igv.removeBrowser(browserRef.current);
          browserRef.current = null;
        }
        const genomeList = await loadGenomeList();
        if (cancelled) return;
        const reference = dataset?.reference || "hg38";
        const entry = (genomeList || []).find((g) => g.id === reference);
        const tracks = groups.map((g) => {
          const keep = new Set(g.ids);
          return {
            id: g.key,
            name: g.name,
            url: casePath(dataset, patient.caseReportId, `slices/${bamFile}`),
            indexURL: casePath(dataset, patient.caseReportId, `slices/${bamFile}.bai`),
            format: "bam",
            type: "alignment",
            height: g.height,
            displayMode: g.key === "carriers" ? "EXPANDED" : "SQUISHED",
            // a function filter replaces igv's defaults, so apply the duplicate / QC-fail / secondary rules here
            filter: (al) =>
              keep.has(al.tags().RG) &&
              !al.isFailsVendorQualityCheck() &&
              !al.isSecondary() &&
              (!hideDup || !al.isDuplicate()) &&
              al.mq >= minMq,
            colorBy: colorBy === "strand" ? "strand" : undefined,
            showSoftClips: false,
            sort: altFirstSort(site.chrom, site.pos),
          };
        });
        browserRef.current = await igv.createBrowser(containerRef.current, {
          genome: entry ? { ...entry, tracks: [] } : reference,
          loadDefaultGenomes: false,
          locus,
          tracks,
          showCenterGuide: true,
          minimumBases: 1,
          showNavigation: true,
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
  }, [locus, trackKey, bamFile]);
  useEffect(
    () => () => {
      if (browserRef.current) igv.removeBrowser(browserRef.current);
    },
    []
  );

  const shown = useMemo(
    () => (reads || []).filter((r) => readPasses(r, { hideDup, minMq }) && (alleleFilter === "all" || r.allele === alleleFilter)),
    [reads, hideDup, minMq, alleleFilter]
  );
  const counts = useMemo(() => {
    const k = { alt: 0, ref: 0, other: 0, del: 0 };
    (reads || []).filter((r) => readPasses(r, { hideDup, minMq })).forEach((r) => (k[r.allele] = (k[r.allele] || 0) + 1));
    return k;
  }, [reads, hideDup, minMq]);

  const columns = [
    { title: "Cell", dataIndex: "cell", width: 190, ellipsis: { showTitle: false }, render: (c) => (c ? <Tooltip title={c} placement="topLeft"><span>{c}</span></Tooltip> : <Text type="secondary">no RG</Text>) },
    { title: "Clone", dataIndex: "clone", width: 100, render: (c) => <ColorTag color={cloneColors[c]}>{c}</ColorTag> },
    { title: "Allele", dataIndex: "allele", width: 76, render: (a) => <Tag color={ALLELE_COLOR[a]}>{a}</Tag> },
    { title: "Strand", dataIndex: "strand", width: 80, align: "center" },
    { title: "BQ", dataIndex: "bq", width: 70, sorter: (a, b) => a.bq - b.bq, render: (q, r) => (r.allele === "del" ? "–" : <Text type={q < 13 ? "danger" : undefined}>{q}</Text>) },
    { title: "MAPQ", dataIndex: "mq", width: 80, sorter: (a, b) => a.mq - b.mq, render: (q) => <Text type={q < 20 ? "danger" : undefined}>{q}</Text> },
    { title: "Dup", dataIndex: "dup", width: 64, render: (d) => (d ? <Tag color="warning">dup</Tag> : "") },
    { title: "From end", dataIndex: "end", width: 96, sorter: (a, b) => a.end - b.end, render: (e, r) => (r.allele === "del" ? "–" : <Text type={e < 5 ? "warning" : undefined}>{e} bp</Text>) },
  ];

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
    <Space direction="vertical" size="small" style={{ width: "100%" }}>
      <Space wrap size={[16, 6]}>
        <Space size={4}>
          <Switch size="small" checked={hideDup} onChange={setHideDup} />
          <Text>hide duplicates</Text>
        </Space>
        <Space size={4}>
          <Text>MAPQ ≥</Text>
          <Segmented size="small" options={[0, 20, 50]} value={minMq} onChange={setMinMq} />
        </Space>
        <Space size={4}>
          <Text>colour reads by</Text>
          <Segmented size="small" options={[{ label: "strand", value: "strand" }, { label: "mismatches only", value: "none" }]} value={colorBy} onChange={setColorBy} />
        </Space>
        <Text type="secondary">Mismatched bases are shaded by base quality (faint = low).</Text>
      </Space>
      {error && <Alert type="error" showIcon message={`IGV: ${error}`} />}
      <Row gutter={[12, 12]}>
        <Col span={24} xl={sideBySide ? 13 : 24}>
          {groups.length ? (
            // own row, full width, clipped so igv's toolbar cannot spill over the filter buttons below
            <div ref={containerRef} className="sc-light-island" style={{ minHeight: 200, minWidth: 560, width: "100%", overflow: "hidden", position: "relative", isolation: "isolate" }} />
          ) : (
            <Text type="secondary">No cell has reads at this site.</Text>
          )}
        </Col>
        <Col span={24} xl={sideBySide ? 11 : 24}>
          {reads?.length ? (
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
              <Space wrap size={[8, 4]}>
                <Segmented
                  size="small"
                  value={alleleFilter}
                  onChange={setAlleleFilter}
                  options={[
                    { label: `alt (${counts.alt})`, value: "alt" },
                    { label: `ref (${counts.ref})`, value: "ref" },
                    { label: `other / del (${counts.other + counts.del})`, value: "other" },
                    { label: "all", value: "all" },
                  ]}
                />
                <Text type="secondary">reads overlapping the site, after the filters above</Text>
              </Space>
              <Table
                size="small"
                className="sc-nowrap-head"
                rowKey="key"
                dataSource={alleleFilter === "other" ? (reads || []).filter((r) => readPasses(r, { hideDup, minMq }) && (r.allele === "other" || r.allele === "del")) : shown}
                columns={columns}
                pagination={{ pageSize: 12, size: "small", hideOnSinglePage: true }}
                scroll={{ x: 760 }}
              />
            </Space>
          ) : (
            <Text type="secondary">Per-read table: not exported for this site (precompute site_evidence covers hotspots and the top discovered sites).</Text>
          )}
        </Col>
      </Row>
    </Space>
    </div>
  );
}
