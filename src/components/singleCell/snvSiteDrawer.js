import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Descriptions, Drawer, Space, Table, Tag, Typography } from "antd";
import singleCellActions from "../../redux/singleCell/actions";
import { snvMetricValue } from "../../helpers/singleCell/matrix";
import { cladeScoreDetail } from "../../helpers/singleCell/snvSites";
import { SNV_CATEGORIES } from "./mutationSidePanel";
import useSignatureModel from "./signatures/useSignatureModel";
import { signatureColorOf } from "./signaturePanel";

const { Text } = Typography;
const IGV_MAX = 8;
const categoryColor = Object.fromEntries(SNV_CATEGORIES.map((c) => [c.key, c.color]));

/**
 * One SNV site: annotation, where it maps on the tree, and every cell with
 * reads at the site (alt / depth / VAF). Pick cells (carriers preselected,
 * up to 8) and open them together in IGV.
 */
export default function SnvSiteDrawer({ open, onClose, variant, order, rows, clickedRow, cnInfo = null }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { snv, cells, cloneColors } = useSelector((state) => state.SingleCell);
  const snvData = snv.status === "ok" ? snv.data : null;
  const model = useSignatureModel();
  const assigned = model.ready && variant ? { signature: model.assignment.signature[variant.index], prob: model.assignment.prob[variant.index] } : null;
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const c = variant?.index;
  const table = useMemo(() => {
    if (!snvData || c == null) return [];
    return order
      .map((id, r) => {
        const p = rows[r];
        if (p == null || p < 0) return null;
        const depth = snvMetricValue(snvData, p, c, "depth");
        if (depth == null) return null;
        const alt = snvMetricValue(snvData, p, c, "alt") ?? 0;
        return { id, clone: cloneOf.get(id), alt, depth, vaf: depth ? alt / depth : 0, carrier: snvData.status[p][c] === 1 };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.carrier) - Number(a.carrier) || b.alt - a.alt);
  }, [snvData, c, order, rows, cloneOf]);
  const [picked, setPicked] = useState(null);
  const defaultPicked = useMemo(() => {
    const first = clickedRow != null ? [order[clickedRow]] : [];
    const carriers = table.filter((x) => x.carrier && !first.includes(x.id)).map((x) => x.id);
    return [...first, ...carriers].slice(0, IGV_MAX);
  }, [table, clickedRow, order]);
  const chosen = picked ?? defaultPicked;
  const toggle = (id, on) => setPicked((cur) => {
    const base = cur ?? defaultPicked;
    return on ? [...base.filter((x) => x !== id), id].slice(-IGV_MAX) : base.filter((x) => x !== id);
  });
  if (!variant) return null;
  const openIgv = () =>
    dispatch(singleCellActions.openIgv({ cellIds: chosen, chromosome: variant.chromosome, position: variant.position, label: variant.id }));
  const carriers = table.filter((x) => x.carrier).length;
  const calls = snvData?.gt && c != null ? snvData.cells.reduce((acc, _, p) => { const g = snvData.gt[p][c]; if (g === 1) acc.alt += 1; else if (g === 0) acc.ref += 1; else acc.none += 1; return acc; }, { alt: 0, ref: 0, none: 0 }) : null;

  return (
    <Drawer open={open} onClose={onClose} width={640} title={variant.id}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Descriptions size="small" column={2} colon={false}>
          {variant.gene && <Descriptions.Item label={t("components.single-cell.tooltip.gene")}>{[variant.gene, variant.protein || variant.consequence].filter(Boolean).join(" ")}</Descriptions.Item>}
          {(variant.oncogenic || variant.oncokbLevel) && <Descriptions.Item label="OncoKB">{[variant.oncogenic, variant.oncokbLevel].filter(Boolean).join(" · ")}{variant.driver && <Tag color="red" style={{ marginLeft: 6 }}>driver</Tag>}</Descriptions.Item>}
          {variant.category && (
            <Descriptions.Item label={t("components.single-cell.snv.category")}>
              <Tag color={categoryColor[variant.category]}>{t(`components.single-cell.snv.category-${variant.category}`)}</Tag>
              {variant.cladeCells != null && <Text type="secondary">{t("components.single-cell.site.clade-cells", { count: variant.cladeCells })}</Text>}
            </Descriptions.Item>
          )}
          {variant.cladeScore != null && <Descriptions.Item label={t("components.single-cell.snv.clade-score")}>{cladeScoreDetail(variant)}</Descriptions.Item>}
          {variant.context && (
            <Descriptions.Item label="SBS96">
              {variant.context}
              {assigned?.signature && (
                <Tag style={{ marginLeft: 6, borderColor: signatureColorOf(assigned.signature), color: signatureColorOf(assigned.signature) }}>
                  {`${assigned.signature} · ${Math.round(100 * assigned.prob)}%`}
                </Tag>
              )}
            </Descriptions.Item>
          )}
          {cnInfo && (
            <Descriptions.Item label={t("components.single-cell.site.cn")}>
              {t("components.single-cell.site.cn-detail", { cn: cnInfo.medianCn.toFixed(1), copies: Number.isFinite(cnInfo.altCopies) ? cnInfo.altCopies.toFixed(1) : "–", n: cnInfo.nAmplified, total: cnInfo.nCarriers })}
              {cnInfo.amplified && <Tag color="red" style={{ marginLeft: 6 }}>{t("components.single-cell.site.amplified")}</Tag>}
            </Descriptions.Item>
          )}
          {cnInfo?.allelic && (
            <Descriptions.Item label={t("components.single-cell.site.allelic")}>
              {t("components.single-cell.site.allelic-detail", { major: cnInfo.allelic.medianMajor.toFixed(0), minor: cnInfo.allelic.medianMinor.toFixed(0), loh: cnInfo.allelic.nLoh, n: cnInfo.allelic.n, onMajor: cnInfo.allelic.nOnMajor, onMinor: cnInfo.allelic.nOnMinor })}
              {cnInfo.allelic.mutantAmplified && <Tag color="magenta" style={{ marginLeft: 6 }}>{t("components.single-cell.site.on-major")}</Tag>}
              {cnInfo.allelic.nLoh === cnInfo.allelic.n && cnInfo.allelic.n > 0 && <Tag color="blue" style={{ marginLeft: 6 }}>LOH</Tag>}
            </Descriptions.Item>
          )}
          <Descriptions.Item label={t("components.single-cell.site.carriers")}>{t("components.single-cell.site.carriers-of", { carriers, covered: table.length })}</Descriptions.Item>
          {calls && <Descriptions.Item label={t("components.single-cell.site.genotypes")}>{t("components.single-cell.site.genotypes-of", calls)}</Descriptions.Item>}
        </Descriptions>
        <Space wrap>
          <Button type="primary" size="small" disabled={!chosen.length} onClick={openIgv}>
            {t("components.single-cell.site.igv", { count: chosen.length })}
          </Button>
          <Button size="small" onClick={() => setPicked(table.filter((x) => x.carrier).slice(0, IGV_MAX).map((x) => x.id))}>
            {t("components.single-cell.site.pick-carriers", { max: IGV_MAX })}
          </Button>
          <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection(table.filter((x) => x.carrier).map((x) => x.id)))}>
            {t("components.single-cell.site.select-carriers")}
          </Button>
          <Button size="small" onClick={() => dispatch(singleCellActions.updateLayout({ snvSiteIds: [variant.id] }))}>
            {t("components.single-cell.report.show-site")}
          </Button>
        </Space>
        <Table
          size="small"
          rowKey="id"
          dataSource={table}
          pagination={{ pageSize: 12, size: "small" }}
          columns={[
            { title: "", key: "pick", width: 36, render: (_, r) => <Checkbox checked={chosen.includes(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} /> },
            { title: t("components.single-cell.tooltip.cell"), dataIndex: "id", render: (id, r) => <span style={{ fontWeight: r.carrier ? 600 : 400 }}>{id}</span> },
            { title: t("components.single-cell.tooltip.clone"), dataIndex: "clone", render: (cl) => (cl ? <Tag color={cloneColors[cl]}>{cl}</Tag> : "–") },
            { title: t("components.single-cell.metric.alt"), dataIndex: "alt", sorter: (a, b) => a.alt - b.alt },
            { title: t("components.single-cell.metric.depth"), dataIndex: "depth", sorter: (a, b) => a.depth - b.depth },
            { title: t("components.single-cell.metric.vaf"), dataIndex: "vaf", sorter: (a, b) => a.vaf - b.vaf, render: (v) => v.toFixed(2) },
          ]}
        />
      </Space>
    </Drawer>
  );
}
