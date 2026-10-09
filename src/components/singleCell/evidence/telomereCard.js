import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Card, Col, Row, Space, Table, Tooltip, Typography } from "antd";
import useRnaData from "../rna/useRnaData";
import { hotspotGenotypes, normaliseTelomeres } from "../../../helpers/singleCell/precompute";
import { expressionByCell } from "../../../helpers/singleCell/staticRna";
import NotComputed, { pcFile } from "./notComputed";
import { Provenance } from "../hintLine";
import ColorTag from "../colorTag";

const { Text } = Typography;
const median = (v) => {
  const s = v.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const fmt = (x, d = 2) => (x == null ? "–" : x.toFixed(d));

/**
 * TERT / telomeres per clone: TERT promoter genotype from the targeted caller
 * (with the cells that had no usable coverage counted separately — the region
 * drops out under PTA), telomere content and variant repeats from the whole
 * DNA BAM, TERT expression from RNA, ATRX status from the patient's events, and
 * an ALT-like flag (high telomere content plus variant repeats).
 */
export default function TelomereCard() {
  const { cells, cloneColors, precompute } = useSelector((s) => s.SingleCell);
  const telRaw = pcFile(precompute, "telomeres");
  const tel = useMemo(() => (telRaw.ok ? { ...telRaw, data: normaliseTelomeres(telRaw.data) } : telRaw), [telRaw.ok, telRaw.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const calls = pcFile(precompute, "calls");
  const { summary: rna, matrix } = useRnaData();

  const tertSites = useMemo(() => {
    const g = hotspotGenotypes(calls.data);
    return Object.keys(g).filter((k) => /^TERT/i.test(k)).map((k) => [k, g[k]]);
  }, [calls.data]);
  // TERT expression keyed by display id (the gOS cell id for cells with DNA)
  const tertExpr = useMemo(() => (rna && matrix ? expressionByCell(rna, matrix, "TERT")?.values || null : null), [rna, matrix]);
  const atrx = useMemo(() => cells.filter((c) => Object.keys(c).some((k) => /^ATRX/i.test(k) && c[k] && c[k] !== "wild type")).length, [cells]);

  const rows = useMemo(() => {
    const telBy = new Map((tel.data?.cells || []).map((r) => [`${r.cell_id}`, r]));
    const byClone = new Map();
    cells.forEach((c) => {
      const k = c.clone_id ?? "unassigned";
      if (!byClone.has(k)) byClone.set(k, []);
      byClone.get(k).push(c);
    });
    return [...byClone.entries()].map(([clone, cs]) => {
      const ids = cs.map((c) => `${c.cell_id}`);
      const t = ids.map((id) => telBy.get(id)).filter(Boolean);
      const tert = tertSites.map(([name, m]) => {
        const v = ids.map((id) => m[id]).filter((x) => x != null);
        return { name, mut: v.filter((x) => x === "mut").length, wt: v.filter((x) => x === "wt").length, nc: v.filter((x) => x === "nc").length };
      });
      const expr = tertExpr ? ids.map((id) => tertExpr[id]).filter((x) => x != null) : [];
      return {
        clone,
        n: cs.length,
        telRel: median(t.map((r) => r.tel_rel)),
        tvr: median(t.map((r) => r.tvr_frac)),
        altLike: t.filter((r) => r.alt_like).length,
        tert,
        tertExpressed: expr.length ? expr.filter((x) => x > 0).length / expr.length : null,
        nExpr: expr.length,
      };
    });
  }, [cells, tel.data, tertSites, tertExpr]);

  return (
    <Card size="small" title={<span>TERT and telomeres by clone <Provenance id="telomeres" /></span>}>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        {!tel.ok && <NotComputed what="Telomere content" step="telomeres" status={tel.status} />}
        {!calls.ok && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            TERT promoter genotypes: not yet computed (precompute step caller).
          </Text>
        )}
        {calls.ok && !tertSites.length && (
          <Text type="secondary" style={{ fontSize: 13 }}>No TERT hotspot in this patient&apos;s region set.</Text>
        )}
        <Table
          size="small"
          rowKey="clone"
          pagination={false}
          dataSource={rows}
          scroll={{ x: 800 }}
          columns={[
            { title: "Clone", dataIndex: "clone", render: (c) => <ColorTag color={cloneColors[c]}>{c}</ColorTag> },
            { title: "Cells", dataIndex: "n", width: 60 },
            ...tertSites.map(([name]) => ({
              title: (
                <Tooltip title="mutant / wild type / no call (no or too little coverage: the GC-rich promoter often drops out under PTA)">
                  {name}
                </Tooltip>
              ),
              key: name,
              render: (_, r) => {
                const s = r.tert.find((x) => x.name === name);
                return s ? (
                  <span>
                    <Text type="danger">{s.mut}</Text> / <Text type="success">{s.wt}</Text> / <Text type="secondary">{s.nc}</Text>
                  </span>
                ) : (
                  "–"
                );
              },
            })),
            { title: "TERT expressed (RNA)", key: "e", render: (_, r) => (r.tertExpressed == null ? "–" : `${Math.round(100 * r.tertExpressed)}% of ${r.nExpr}`) },
            { title: "Telomere content (× normal)", dataIndex: "telRel", render: (x) => fmt(x) },
            { title: "Variant repeats", dataIndex: "tvr", render: (x) => fmt(x, 3) },
            { title: "ALT-like cells", dataIndex: "altLike" },
          ]}
        />
        <Row>
          <Col span={24}>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Telomere content: reads with ≥ {tel.data?.params?.min_repeats || 7} TTAGGG repeats per million reads, relative to the{" "}
              {tel.data?.reference || "patient"} median. ALT-like: content and variant-repeat fraction both &gt; 2 robust SD above the patient
              median{atrx ? `; ${atrx} cells carry an ATRX alteration` : ""}. TERT expression is often below detection in single cells, so
              &quot;not expressed&quot; is weak evidence. {rna ? "" : "No RNA for this patient."}
            </Text>
          </Col>
        </Row>
      </Space>
    </Card>
  );
}
