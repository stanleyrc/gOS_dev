import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Drawer, Space, Table, Tag, Typography } from "antd";
import { fitSignatures, sbs96Counts } from "../../helpers/singleCell/signatures";
import { SNV_CATEGORIES } from "./mutationSidePanel";
import { ActivityBars, AetiologyLegend, Profile, loadCosmic } from "./signaturePanel";
import singleCellActions from "../../redux/singleCell/actions";

const { Text } = Typography;
const WIDTH = 720;
const IGV_CELLS = 8;
const categoryColor = Object.fromEntries(SNV_CATEGORIES.map((c) => [c.key, c.color]));

/**
 * The SNVs mapped to one branch of the tree (the node a site's one-gain
 * mapping places it on), with a browser SBS fit of just those sites.
 */
export default function BranchSnvDrawer({ open, onClose, snv, variantIdx, cellIds }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [fit, setFit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setFit(null), [variantIdx]);

  const rows = useMemo(() => (snv && variantIdx ? variantIdx.map((c) => snv.variants[c]) : []), [snv, variantIdx]);
  const contexts = useMemo(() => rows.map((v) => v.context).filter(Boolean), [rows]);

  const runFit = async () => {
    setBusy(true);
    setError(null);
    try {
      const reference = await loadCosmic();
      const { counts, used } = sbs96Counts(contexts);
      await new Promise((resolve) => setTimeout(resolve, 20));
      setFit({ ...fitSignatures(counts, reference), counts, used });
    } catch (e) {
      setError(e.message || `${e}`);
    }
    setBusy(false);
  };

  const columns = [
    {
      title: t("components.single-cell.branch.site"),
      dataIndex: "id",
      key: "id",
      render: (id, v) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          title={t("components.single-cell.branch.igv")}
          onClick={() =>
            dispatch(
              singleCellActions.openIgv({ cellIds: cellIds.slice(0, IGV_CELLS), chromosome: v.chromosome, position: v.position, label: v.id })
            )
          }
        >
          {id}
        </Button>
      ),
      sorter: (a, b) => a.global - b.global,
    },
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", key: "gene", render: (g) => g || "–" },
    {
      title: t("components.single-cell.branch.effect"),
      key: "effect",
      render: (_, v) => (
        <Space size={4}>
          <Text>{v.protein || v.consequence || "–"}</Text>
          {v.driver && <Tag color="red">{v.oncokbLevel || v.oncogenic || "driver"}</Tag>}
        </Space>
      ),
      sorter: (a, b) => Number(b.driver) - Number(a.driver),
    },
    {
      title: t("components.single-cell.snv.category"),
      dataIndex: "category",
      key: "category",
      render: (c) => (c ? <Tag color={categoryColor[c]}>{t(`components.single-cell.snv.category-${c}`)}</Tag> : "–"),
    },
    {
      title: t("components.single-cell.branch.alt-cells"),
      key: "cells",
      render: (_, v) => (v.cladeCells != null ? `${v.altCells ?? "?"}/${v.cladeCells}` : "–"),
    },
    { title: "SBS96", dataIndex: "context", key: "context", render: (c) => c || "–" },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={WIDTH}
      title={t("components.single-cell.branch.title", { count: rows.length, cells: cellIds.length })}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Text type="secondary">{t("components.single-cell.branch.help")}</Text>
        <Space>
          <Button size="small" onClick={runFit} loading={busy} disabled={!contexts.length}>
            {t("components.single-cell.branch.fit", { count: contexts.length })}
          </Button>
          <Button size="small" onClick={() => dispatch(singleCellActions.updateLayout({ snvSiteIds: rows.map((v) => v.id) }))}>
            {t("components.single-cell.branch.show-in-heatmap")}
          </Button>
        </Space>
        {error && <Alert type="error" showIcon message={error} />}
        {fit && (
          <>
            <Text type="secondary">
              {t("components.single-cell.branch.fit-summary", { n: fit.used, cosine: fit.cosine.toFixed(2) })}
            </Text>
            <Profile counts={fit.counts} reconstruction={fit.reconstruction} width={WIDTH - 48} />
            <ActivityBars rows={[{ name: t("components.single-cell.branch.this-branch"), n: fit.used, activities: fit.activities }]} width={WIDTH - 48} />
            <AetiologyLegend rows={[{ activities: fit.activities }]} />
          </>
        )}
        <Table size="small" rowKey="id" columns={columns} dataSource={rows} pagination={{ pageSize: 25 }} />
      </Space>
    </Drawer>
  );
}
