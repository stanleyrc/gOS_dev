import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, Empty, Space, Table, Tooltip, Typography } from "antd";
import HintLine from "../hintLine";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { fieldLabel } from "../../../helpers/singleCell/fieldLabels";
import { formatP, mannWhitney } from "../../../helpers/singleCell/tests";
import { JUNCTION_COLORS } from "../../../helpers/singleCell/rnaColors";
import { balanceTable } from "../../../helpers/singleCell/driverContrast";
import { CARRIER_COLOR, COMPARATOR_COLOR } from "./useDriverEvidence";

const { Text } = Typography;
const CATEGORICAL = ["state", "Phase", "Cell_Type"];
const NUMERIC = ["S_Score", "G2M_Score", "nFeature_RNA", "percent_mt"];

/** One stacked bar of level shares. */
function ShareBar({ levels, side, total, colorOf }) {
  return (
    <div style={{ display: "flex", height: 14, width: "100%", borderRadius: 2, overflow: "hidden" }}>
      {levels.map((l) =>
        l[side] > 0 ? (
          <Tooltip key={l.level} title={`${l.level}: ${l[side]} (${Math.round((100 * l[side]) / total)}%)`}>
            <div style={{ width: `${(100 * l[side]) / total}%`, background: colorOf(l.level) }} />
          </Tooltip>
        ) : null
      )}
    </div>
  );
}

/** Cell state / cycle composition and RNA scores of carriers vs comparator (cells with RNA). */
export default function DriverPhenotypeCard({ carriers, others, rna }) {
  const { t } = useTranslation("common");
  const { summary, rowOfId } = rna;
  const fields = useMemo(() => new Map((summary?.fields || []).map((f) => [f.name, f])), [summary]);
  const cellOf = useMemo(() => {
    const m = new Map();
    (summary?.cells || []).forEach((c) => m.set(`${c.displayId}`, c));
    return m;
  }, [summary]);
  const a = useMemo(() => carriers.filter((id) => rowOfId?.has(id)), [carriers, rowOfId]);
  const b = useMemo(() => others.filter((id) => rowOfId?.has(id)), [others, rowOfId]);
  const cats = useMemo(
    () =>
      balanceTable(a, b, CATEGORICAL.filter((f) => fields.has(f) && !fields.get(f).numeric), (id, f) => cellOf.get(id)?.[f] ?? null).filter(
        (c) => c.levels.length > 1
      ),
    [a, b, fields, cellOf]
  );
  const nums = useMemo(
    () =>
      NUMERIC.filter((f) => fields.has(f))
        .map((f) => {
          const va = a.map((id) => Number(cellOf.get(id)?.[f])).filter(Number.isFinite);
          const vb = b.map((id) => Number(cellOf.get(id)?.[f])).filter(Number.isFinite);
          const med = (v) => {
            const s = v.slice().sort((x, y) => x - y);
            return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
          };
          return { field: f, a: med(va), b: med(vb), p: mannWhitney(va, vb).p };
        })
        .filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b)),
    [a, b, fields, cellOf]
  );
  const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2));

  return (
    <Card size="small" title={t("components.single-cell.drivers.pheno-title")} style={{ marginBottom: 8 }}>
      {!summary || !a.length || !b.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.drivers.no-pheno")} />
      ) : (
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <HintLine text={t("components.single-cell.drivers.pheno-hint", { a: a.length, b: b.length })} />
          {cats.map((c) => {
            const colorOf = (level) => JUNCTION_COLORS[c.levels.findIndex((l) => l.level === level) % JUNCTION_COLORS.length];
            return (
              <div key={c.attr}>
                <Space size={8} style={{ fontSize: TYPE.tick }}>
                  <Text strong>{fieldLabel(c.attr)}</Text>
                  <Text type="secondary">{formatP(c.p)}</Text>
                </Space>
                {[
                  ["a", c.nA, CARRIER_COLOR, t("components.single-cell.drivers.carriers")],
                  ["b", c.nB, COMPARATOR_COLOR, t("components.single-cell.drivers.comparator")],
                ].map(([side, total, color, name]) => (
                  <div key={side} style={{ display: "grid", gridTemplateColumns: "92px 1fr", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <Text style={{ fontSize: TYPE.tick, color }}>{`${name} (${total})`}</Text>
                    <ShareBar levels={c.levels} side={side} total={total || 1} colorOf={colorOf} />
                  </div>
                ))}
                <Space size={[10, 0]} wrap style={{ fontSize: TYPE.tick, marginTop: 2 }}>
                  {c.levels.map((l) => (
                    <span key={l.level}>
                      <span style={{ color: colorOf(l.level) }}>■</span> {l.level}
                    </span>
                  ))}
                </Space>
              </div>
            );
          })}
          {nums.length > 0 && (
            <Table
              size="small"
              rowKey="field"
              pagination={false}
              dataSource={nums}
              columns={[
                { title: t("components.single-cell.drivers.score"), dataIndex: "field", key: "f", render: fieldLabel },
                { title: t("components.single-cell.drivers.median-carriers"), dataIndex: "a", key: "a", align: "right", render: fmt },
                { title: t("components.single-cell.drivers.median-comparator"), dataIndex: "b", key: "b", align: "right", render: fmt },
                { title: "p", dataIndex: "p", key: "p", align: "right", render: (p) => formatP(p) || "–" },
              ]}
            />
          )}
        </Space>
      )}
    </Card>
  );
}
