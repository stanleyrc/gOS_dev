import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Space, Typography } from "antd";
import { NodeIndexOutlined } from "@ant-design/icons";
import { walkContainment } from "../../../helpers/singleCell/walks";

const { Text } = Typography;
const fmtBp = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)} Mb` : `${(v / 1e3).toFixed(0)} kb`);

/**
 * How the selected walks relate: for every pair, the fraction of one walk's
 * genome that lies inside the other (1 = fully contained). Variants of a
 * species show up as rows that are ~100 % inside the longer walk; separate
 * ecDNA species share nothing.
 */
export default function WalkContainmentCard({ walks, colorOf }) {
  const { t } = useTranslation("common");
  const { matrix, lengths } = useMemo(() => walkContainment(walks), [walks]);
  if (walks.length < 2) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.contain-few")} />;
  const order = d3.range(walks.length).sort((a, b) => lengths[b] - lengths[a]);
  const cell = Math.max(28, Math.min(48, 520 / walks.length));
  const LEFT = 170;
  const TOP = 110;
  const color = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);
  const pairs = [];
  order.forEach((i) => order.forEach((j) => { if (i !== j && matrix[i][j] >= 0.9) pairs.push([i, j]); }));
  return (
    <Card size="small" title={<Space><NodeIndexOutlined />{t("components.single-cell.ecdna.contain-title")}</Space>}>
      <svg width={LEFT + order.length * cell + 10} height={TOP + order.length * cell + 6}>
        {order.map((j, c) => (
          <text key={`c${j}`} transform={`translate(${LEFT + (c + 0.5) * cell},${TOP - 6}) rotate(-55)`} fontSize={11} fill={colorOf(walks[j].id)} fontWeight={600}>{walks[j].label}</text>
        ))}
        {order.map((i, r) => (
          <g key={`r${i}`}>
            <text x={LEFT - 8} y={TOP + (r + 0.5) * cell} dy="0.35em" textAnchor="end" fontSize={11} fill={colorOf(walks[i].id)} fontWeight={600}>{`${walks[i].label} (${fmtBp(lengths[i])})`}</text>
            {order.map((j, c) => (
              <g key={`${i}-${j}`}>
                <rect x={LEFT + c * cell + 1} y={TOP + r * cell + 1} width={cell - 2} height={cell - 2} fill={i === j ? "#f0f0f0" : color(matrix[i][j])} rx={3} />
                {i !== j && <text x={LEFT + (c + 0.5) * cell} y={TOP + (r + 0.5) * cell} dy="0.35em" textAnchor="middle" fontSize={10} fill={matrix[i][j] > 0.55 ? "#fff" : "#262626"}>{d3.format(".0%")(matrix[i][j])}</text>}
                <title>{i === j ? walks[i].label : t("components.single-cell.ecdna.contain-cell", { a: walks[i].label, b: walks[j].label, pct: d3.format(".0%")(matrix[i][j]) })}</title>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <div style={{ marginTop: 6 }}>
        {pairs.slice(0, 8).map(([i, j]) => (
          <div key={`${i}-${j}`} style={{ fontSize: 12 }}>
            <span style={{ color: colorOf(walks[i].id), fontWeight: 600 }}>{walks[i].label}</span> {t("components.single-cell.ecdna.contain-in")} <span style={{ color: colorOf(walks[j].id), fontWeight: 600 }}>{walks[j].label}</span> ({d3.format(".0%")(matrix[i][j])})
          </div>
        ))}
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.ecdna.contain-help")}</Text>
      </div>
    </Card>
  );
}
