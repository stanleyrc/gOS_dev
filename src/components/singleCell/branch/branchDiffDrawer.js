import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Drawer, Progress, Segmented, Space, Statistic, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import BranchSnvDrawer from "../branchSnvDrawer";
import useRnaData from "../rna/useRnaData";
import singleCellActions from "../../../redux/singleCell/actions";
import { differentialExpression } from "../../../helpers/singleCell/rnaStats";
import { cisTrans, cladeAndSister, cnaDiff, junctionDiff } from "../../../helpers/singleCell/branchDiff";
import { Provenance } from "../hintLine";

const { Text } = Typography;
const WIDTH = 980;
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(d));
const fmtP = (p) => (p == null || !Number.isFinite(p) ? "–" : p < 1e-3 ? p.toExponential(1) : p.toFixed(3));
const mb = (x) => `${(x / 1e6).toFixed(1)} Mb`;

/**
 * Clicking a branch: what was gained on it, judged against the sister clade(s)
 * (the parent's other children), which holds the shared upstream history
 * constant. Tabs: copy-number segments and SV junctions that differ from the
 * sister, the SNVs mapped to the branch with their signature fit, and DE of
 * clade vs sister split into cis (genes inside a CN segment of the branch,
 * with whether the direction follows the dosage) and trans.
 */
export default function BranchDiffDrawer({ open, onClose, layout, node, snv, variantIdx }) {
  const dispatch = useDispatch();
  const { cn, junctions, cloneColors, cells } = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const { optionsList: geneOptions, genesStartPoint, genesEndPoint } = useSelector((s) => s.Genes);
  const { summary, matrix, rowsFor } = useRnaData();
  const [de, setDe] = useState(null);
  const [progress, setProgress] = useState(null);
  const [effectFilter, setEffectFilter] = useState("all");
  useEffect(() => {
    setDe(null);
    setProgress(null);
  }, [node]);

  const groups = useMemo(() => cladeAndSister(layout, node), [layout, node]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const composition = (ids) => {
    const m = new Map();
    ids.forEach((id) => m.set(cloneOf.get(id) ?? "?", (m.get(cloneOf.get(id) ?? "?") || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  // sister clade without CN profiles (e.g. normal cells at the tumour root): compare with the diploid germline
  const sisterHasCn = useMemo(() => {
    if (!groups || cn.status !== "ok") return false;
    const rowOf = new Map(cn.data.cells.map((id, k) => [`${id}`, cn.data.rows[k]]));
    return groups.sister.some((id) => rowOf.get(id));
  }, [groups, cn]);
  const vsReference = groups && !sisterHasCn;
  const segments = useMemo(
    () => (groups && cn.status === "ok" ? cnaDiff(cn.data, groups.clade, groups.sister, chromoBins, { referenceCn: 2 }) : []),
    [groups, cn, chromoBins]
  );
  const juncs = useMemo(
    () =>
      groups && junctions.status === "ok"
        ? junctionDiff(junctions.data, groups.clade, groups.sister, { absentWithoutSister: true })
        : [],
    [groups, junctions]
  );
  const genePos = useMemo(() => {
    const m = new Map();
    (geneOptions || []).forEach((o) => {
      const i = o.value;
      m.set(o.label, (Number(genesStartPoint[i]) + Number(genesEndPoint[i])) / 2);
    });
    return m;
  }, [geneOptions, genesStartPoint, genesEndPoint]);
  const genesIn = (s) => {
    const out = [];
    genePos.forEach((pos, g) => pos >= s.gStart && pos <= s.gEnd && out.push(g));
    return out;
  };

  const rowsA = groups && summary ? rowsFor(groups.clade) : [];
  const rowsB = groups && summary ? rowsFor(groups.sister) : [];
  const canDe = matrix && rowsA.length >= 3 && rowsB.length >= 3;
  const runDe = async () => {
    setProgress(0);
    const genes = await differentialExpression(matrix, summary.genes, summary.cells.length, rowsA, rowsB, {
      minPct: 0.1,
      onProgress: (f) => setProgress(Math.round(f * 100)),
    });
    setProgress(null);
    setDe(cisTrans(genes, segments, genePos));
  };
  const deSig = useMemo(() => (de ? de.filter((g) => g.q_val < 0.05 && Math.abs(g.avg_log2FC) >= 0.25) : []), [de]);
  const deShown = deSig.filter((g) => effectFilter === "all" || g.effect === effectFilter);
  const nCis = deSig.filter((g) => g.effect === "cis").length;
  const nConc = deSig.filter((g) => g.effect === "cis" && g.concordant).length;

  if (!groups) return null;
  const select = (ids) => dispatch(singleCellActions.updateSelection(ids));
  const Comp = ({ ids }) => (
    <Space size={[4, 4]} wrap>
      {composition(ids).map(([c, n]) => (
        <Tag key={c} color={cloneColors[c]}>
          {c} {n}
        </Tag>
      ))}
    </Space>
  );

  const tabs = [
    {
      key: "cna",
      label: `Copy number (${segments.length})`,
      children: (
        <Space direction="vertical" style={{ width: "100%" }} size="small">
          <Text type="secondary" style={{ fontSize: 13 }}>
            1 Mb grid; a segment differs when the clade median is ≥ 0.75 copies from the sister median and ≥ 60% of clade cells depart in the same direction.
          </Text>
          <Table
            size="small"
            rowKey={(s) => `${s.chromosome}:${s.start}`}
            dataSource={segments}
            pagination={{ pageSize: 15, size: "small" }}
            columns={[
              { title: "Region", key: "r", render: (_, s) => `chr${s.chromosome}:${mb(s.start)}–${mb(s.end)}` },
              { title: "Size", key: "w", render: (_, s) => mb(s.end - s.start), sorter: (a, b) => a.end - a.start - (b.end - b.start) },
              { title: "Change", dataIndex: "type", render: (t) => <Tag color={t === "gain" ? "red" : "blue"}>{t}</Tag> },
              { title: "Clade CN", dataIndex: "cladeCn", render: (x) => fmt(x, 1) },
              { title: "Sister CN", dataIndex: "sisterCn", render: (x) => fmt(x, 1) },
              { title: "Clade cells changed", dataIndex: "frac", render: (x) => `${Math.round(100 * x)}%` },
              {
                title: "Genes",
                key: "g",
                render: (_, s) => {
                  const g = genesIn(s);
                  return (
                    <Tooltip title={g.slice(0, 60).join(", ")}>
                      <Text style={{ fontSize: 13 }}>
                        {g.length} {g.length ? `(${g.slice(0, 4).join(", ")}${g.length > 4 ? "…" : ""})` : ""}
                      </Text>
                    </Tooltip>
                  );
                },
              },
            ]}
          />
        </Space>
      ),
    },
    {
      key: "sv",
      label: `SV junctions (${juncs.length})`,
      children: (
        <Table
          size="small"
          rowKey="id"
          dataSource={juncs}
          pagination={{ pageSize: 15, size: "small" }}
          columns={[
            { title: "Junction", dataIndex: "id" },
            { title: "Class", dataIndex: "class", render: (c) => c || "–" },
            { title: "Change", dataIndex: "change", render: (c) => <Tag color={c === "gained" ? "volcano" : "geekblue"}>{c}</Tag> },
            { title: "Clade cells", dataIndex: "cladeFrac", render: (x) => `${Math.round(100 * x)}%` },
            { title: "Sister cells", dataIndex: "sisterFrac", render: (x) => `${Math.round(100 * x)}%` },
          ]}
        />
      ),
    },
    {
      key: "snv",
      label: `SNVs & signatures (${variantIdx?.length || 0})`,
      children: snv ? (
        <BranchSnvDrawer embedded snv={snv} variantIdx={variantIdx || []} cellIds={groups.clade} />
      ) : (
        <Text type="secondary">No SNV matrix for this patient.</Text>
      ),
    },
    {
      key: "de",
      label: "Expression vs sister",
      children: (
        <Space direction="vertical" style={{ width: "100%" }} size="small">
          {!summary ? (
            <Text type="secondary">No RNA for this patient.</Text>
          ) : !canDe ? (
            <Alert type="info" showIcon message={`Needs ≥ 3 cells with RNA on each side (clade ${rowsA.length}, sister ${rowsB.length}).`} />
          ) : (
            <Space>
              <Button size="small" type="primary" onClick={runDe} loading={progress != null}>
                Run DE: clade ({rowsA.length}) vs sister ({rowsB.length})
              </Button>
              {progress != null && <Progress percent={progress} size="small" style={{ width: 160 }} />}
            </Space>
          )}
          {de && (
            <>
              <Space size="large" wrap>
                <Statistic title="DE genes (q < 0.05, |log2FC| ≥ 0.25)" value={deSig.length} />
                <Statistic title="cis (inside a CN change of this branch)" value={nCis} />
                <Statistic title="cis following dosage" value={nCis ? `${nConc}/${nCis}` : "–"} />
                <Statistic title="trans" value={deSig.length - nCis} />
              </Space>
              <Segmented
                size="small"
                value={effectFilter}
                onChange={setEffectFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "cis", label: "cis" },
                  { value: "trans", label: "trans" },
                ]}
              />
              <Table
                size="small"
                rowKey="gene"
                dataSource={deShown}
                pagination={{ pageSize: 20, size: "small" }}
                columns={[
                  { title: "Gene", dataIndex: "gene" },
                  {
                    title: "log2FC (clade / sister)",
                    dataIndex: "avg_log2FC",
                    sorter: (a, b) => a.avg_log2FC - b.avg_log2FC,
                    render: (v) => <span style={{ color: v > 0 ? "#cf1322" : "#1d39c4" }}>{fmt(v)}</span>,
                  },
                  { title: "q (BH)", dataIndex: "q_val", defaultSortOrder: "ascend", sorter: (a, b) => a.q_val - b.q_val, render: fmtP },
                  {
                    title: "cis / trans",
                    key: "e",
                    render: (_, g) =>
                      g.effect === "cis" ? (
                        <Tooltip title={`${g.segment.type} chr${g.segment.chromosome}:${mb(g.segment.start)}–${mb(g.segment.end)}`}>
                          <Tag color={g.concordant ? "purple" : "orange"}>cis {g.concordant ? "(follows dosage)" : "(against dosage)"}</Tag>
                        </Tooltip>
                      ) : (
                        <Tag>trans</Tag>
                      ),
                  },
                ]}
              />
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Drawer open={open} onClose={onClose} width={WIDTH} title={<span>{`Branch diff: clade of ${groups.clade.length} cells vs sister of ${groups.sister.length}`} <Provenance id="branchDiff" /></span>}>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        {!groups.sister.length && <Alert type="warning" showIcon message="This is the root: there is no sister clade to compare with." />}
        {groups.sister.length > 0 && vsReference && (
          <Alert
            type="info"
            showIcon
            message="The sister cells have no copy-number profiles (e.g. normal cells), so copy number is compared with a diploid reference (CN 2) and junctions with absence."
          />
        )}
        <Space wrap>
          <Text strong>Clade</Text>
          <Comp ids={groups.clade} />
          <Button size="small" onClick={() => select(groups.clade)}>
            select
          </Button>
          <Text strong style={{ marginLeft: 12 }}>
            Sister
          </Text>
          <Comp ids={groups.sister} />
          <Button size="small" onClick={() => select(groups.sister)} disabled={!groups.sister.length}>
            select
          </Button>
        </Space>
        <Tabs size="small" items={tabs} />
      </Space>
    </Drawer>
  );
}
