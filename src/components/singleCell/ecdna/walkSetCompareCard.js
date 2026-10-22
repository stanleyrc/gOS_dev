import React, { useMemo } from "react";
import { Card, Col, Empty, Row, Space, Tag, Typography } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import useWalks from "./useWalks";
import WalksPlot from "./walksPlot";
import { walkFamilies } from "../../../helpers/singleCell/walks";
import { pairWalkSets, summarizePairs } from "../../../helpers/singleCell/walkSetCompare";

const { Text } = Typography;
const COLOR = { reproduces: "green", partial: "gold", new: "magenta", unpaired: "default" };
const f2 = (v) => (typeof v === "number" ? v.toFixed(2) : "n/a");

function OneWalk({ walk, colorOf, nCells, lane, empty }) {
  const families = useMemo(() => (walk ? walkFamilies([walk]) : []), [walk]);
  if (!walk) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
  return <WalksPlot walks={[walk]} families={families} colorOf={colorOf} focus={null} onFocus={() => {}} labelWidth={170} rightWidth={10} laneHeight={lane} nCells={nCells} />;
}

/** Curated and peel walks aligned in rows (peel walk beside the curated walk it reproduces); both drawn with the walk plot on the shared genome axis. */
export default function WalkSetCompareCard({ curatedSource, peelSource, cellIds }) {
  const cur = useWalks(cellIds, curatedSource);
  const peel = useWalks(cellIds, peelSource);
  const rows = useMemo(() => pairWalkSets(cur.all, peel.all), [cur.all, peel.all]);
  const sum = summarizePairs(rows);
  if (peel.status !== "ok") return <Card size="small" title="Compare walk sets"><Empty description="not available (no peel v4 walks for this patient)" /></Card>;
  return (
    <Card
      size="small"
      title={<Space><SwapOutlined />Compare: curated (left) vs Peel v4 (right)</Space>}
      extra={<Space size={4} wrap>{Object.entries(sum).map(([k, n]) => <Tag key={k} color={COLOR[k]}>{n} {k}</Tag>)}</Space>}
    >
      {rows.map((r) => (
        <div key={r.key} style={{ borderTop: "1px solid #eee", padding: "6px 0" }}>
          <Space size={8} wrap style={{ marginBottom: 2 }}>
            <Tag color={COLOR[r.status]}>{r.status}</Tag>
            {r.peel && r.curated && <Text type="secondary">cosine {f2(r.cosine)} / junction Jaccard {f2(r.jaccard)} / rho free {f2(r.rho)}{r.rhoCplex != null ? ` / rho CPLEX ${f2(r.rhoCplex)}` : ""}</Text>}
            {r.curatedShared && <Text type="secondary">(curated walk also matched by an earlier peel walk)</Text>}
            {r.missingCurated && <Text type="warning">matched curated walk id not in walks.json</Text>}
          </Space>
          <Row gutter={8}>
            <Col span={12}><OneWalk walk={r.curated} colorOf={cur.colorOf} nCells={cellIds.length} lane={18} empty="no curated counterpart" /></Col>
            <Col span={12}><OneWalk walk={r.peel} colorOf={peel.colorOf} nCells={cellIds.length} lane={18} empty="not recovered by Peel v4" /></Col>
          </Row>
        </div>
      ))}
    </Card>
  );
}
