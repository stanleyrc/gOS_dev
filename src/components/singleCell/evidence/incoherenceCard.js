import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Space, Table, Tag, Tooltip, Typography } from "antd";
import useTreeView from "../useTreeView";
import useContainerWidth from "../useContainerWidth";
import singleCellActions from "../../../redux/singleCell/actions";
import { amplifiedSegments, ecdnaLike, segmentIncoherence } from "../../../helpers/singleCell/incoherence";

const { Text } = Typography;
const mb = (x) => `${(x / 1e6).toFixed(2)} Mb`;
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–");

/** Per-cell copies of one segment in tree leaf order (bars), coloured by clone. */
function CopyStrip({ ids, values, cloneOf, cloneColors, width }) {
  const h = 110;
  const v = ids.map((id) => values.get(id));
  const max = Math.max(1, ...v.filter(Number.isFinite));
  const w = width / Math.max(1, ids.length);
  return (
    <svg width={width} height={h + 14} style={{ display: "block" }}>
      {ids.map((id, i) => {
        const x = values.get(id);
        if (!Number.isFinite(x)) return null;
        const bh = (x / max) * h;
        return (
          <rect key={id} x={i * w} y={h - bh} width={Math.max(1, w - 0.5)} height={bh} fill={cloneColors[cloneOf.get(id)] || "#888"}>
            <title>{`${id}: CN ${x}`}</title>
          </rect>
        );
      })}
      <text x={0} y={h + 12} fontSize={10} fill="currentColor">
        cells in tree order · max CN {Math.round(max)}
      </text>
    </svg>
  );
}

/**
 * Phylogenetic incoherence of amplified copy number. For each amplified
 * segment (CN >= 6 in >= 10% of tumour cells): spread of the per-cell copies
 * (CV, excess kurtosis) and how much of it the DNA tree explains (nearest-
 * neighbour discordance: ~1 = tree neighbours differ as much as random pairs;
 * Moran's I). Inherited (chromosomal / HSR) amplicons follow the tree; ecDNA,
 * segregating randomly at division, does not. The ecDNA tab has the walks.
 */
export default function IncoherenceCard() {
  const dispatch = useDispatch();
  const { cn, cells, cloneColors } = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const { optionsList: geneOptions, genesStartPoint, genesEndPoint } = useSelector((s) => s.Genes);
  const { treeLayout } = useTreeView();
  const [ref, width] = useContainerWidth(900);
  const [pick, setPick] = useState(null);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const tumour = useMemo(
    () => (treeLayout ? treeLayout.leaves.map(String).filter((id) => !/^normal$/i.test(`${cloneOf.get(id) || ""}`)) : []),
    [treeLayout, cloneOf]
  );
  const rows = useMemo(() => {
    if (cn.status !== "ok" || !treeLayout || !chromoBins) return [];
    const segs = amplifiedSegments(cn.data, chromoBins, { cellIds: new Set(tumour) });
    return segs
      .map((s, i) => {
        const st = segmentIncoherence(treeLayout, s.values, tumour);
        const genes = [];
        (geneOptions || []).forEach((o) => {
          const mid = (Number(genesStartPoint[o.value]) + Number(genesEndPoint[o.value])) / 2;
          if (mid >= s.gStart && mid <= s.gEnd) genes.push(o.label);
        });
        return st ? { key: i, ...s, ...st, genes, ecdna: ecdnaLike(st) } : null;
      })
      .filter(Boolean);
  }, [cn, treeLayout, chromoBins, tumour, geneOptions, genesStartPoint, genesEndPoint]);
  const sel = rows.find((r) => r.key === pick) || rows[0];

  if (cn.status !== "ok") return <Text type="secondary">No copy-number profiles for this patient.</Text>;
  return (
    <Card size="small" title="Amplicons that do not follow the tree (ecDNA-like incoherence)" ref={ref}>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Text type="secondary" style={{ fontSize: 12 }}>
          ecDNA-like: CV ≥ 0.5 and nearest-neighbour discordance ≥ 0.7 (tree neighbours almost as different as random pairs). Copy numbers come
          from the cells&apos; JaBbA graphs (250 kb grid), so very high counts are capped by what the graphs resolve.
        </Text>
        <Table
          size="small"
          rowKey="key"
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: "No amplified segments (CN ≥ 6 in ≥ 10% of tumour cells)" }}
          onRow={(r) => ({ onClick: () => setPick(r.key), style: { cursor: "pointer", background: sel?.key === r.key ? "rgba(24,144,255,0.08)" : undefined } })}
          columns={[
            { title: "Segment", key: "s", render: (_, r) => `chr${r.chromosome}:${mb(r.start)}–${mb(r.end)}` },
            {
              title: "Genes",
              key: "g",
              render: (_, r) => (
                <Tooltip title={r.genes.slice(0, 40).join(", ")}>
                  <Text style={{ fontSize: 12 }}>{r.genes.slice(0, 4).join(", ") || "–"}{r.genes.length > 4 ? ` +${r.genes.length - 4}` : ""}</Text>
                </Tooltip>
              ),
            },
            { title: "Median CN", dataIndex: "median", render: (x) => fmt(x, 0) },
            { title: "Max CN", dataIndex: "max", render: (x) => fmt(x, 0) },
            { title: "CV", dataIndex: "cv", render: (x) => fmt(x) },
            { title: "Excess kurtosis", dataIndex: "kurtosis", render: (x) => fmt(x, 1) },
            { title: <Tooltip title="mean |CN - CN of tree neighbour| / mean |CN_i - CN_j|">NN discordance</Tooltip>, dataIndex: "nnRatio", sorter: (a, b) => a.nnRatio - b.nnRatio, render: (x) => fmt(x) },
            { title: "Moran's I", dataIndex: "moranI", render: (x) => fmt(x, 3) },
            { title: "", dataIndex: "ecdna", render: (e) => (e ? <Tag color="magenta">ecDNA-like</Tag> : <Tag>tree-coherent</Tag>) },
          ]}
        />
        {sel && treeLayout && (
          <div>
            <Space>
              <Text style={{ fontSize: 12 }}>
                chr{sel.chromosome}:{mb(sel.start)}–{mb(sel.end)}
              </Text>
              <a
                onClick={() =>
                  dispatch(singleCellActions.updateSelection(tumour.filter((id) => sel.values.get(id) >= Math.max(6, sel.median))))
                }
              >
                select cells at ≥ median CN
              </a>
            </Space>
            <CopyStrip ids={tumour} values={sel.values} cloneOf={cloneOf} cloneColors={cloneColors} width={Math.max(300, width - 24)} />
          </div>
        )}
      </Space>
    </Card>
  );
}
