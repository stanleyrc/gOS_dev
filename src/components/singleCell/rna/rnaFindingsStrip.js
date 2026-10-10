import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Space, Typography } from "antd";
import HintLine from "../hintLine";
import RnaFusionModal from "./rnaFusionModal";
import { FindingKindTag } from "./rnaFindingsList";
import { rnaHeadlineItems } from "../../../helpers/singleCell/rnaHeadlineFindings";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text, Link } = Typography;
const k = "components.single-cell.splicing";

/** Headline items of the loaded patient (redux rnaSplicing / rnaFusions): splicing findings and tier 1–2 fusions. */
export function usePatientRnaHeadlines() {
  const splicing = useSelector((s) => s.SingleCell.rnaSplicing);
  const fusions = useSelector((s) => s.SingleCell.rnaFusions);
  return useMemo(
    () =>
      rnaHeadlineItems({
        splicing: splicing?.status === "ok" ? splicing.data.findings || [] : [],
        fusions: fusions?.status === "ok" ? fusions.data.fusions || [] : [],
        nCellsRna: fusions?.status === "ok" ? fusions.data.nCellsRna : null,
        max: Infinity,
      }),
    [splicing, fusions]
  );
}

/**
 * The patient's top RNA findings above the RNA sub-tabs, so they are seen
 * without opening "Fusions & splicing": one line each; clicking a splicing
 * finding opens it in the splicing card (onPickSplicing), a fusion opens
 * its popup; "all" opens the sub-tab.
 */
export default function RnaFindingsStrip({ max = 4, onPickSplicing, onShowAll }) {
  const { t } = useTranslation("common");
  const items = usePatientRnaHeadlines();
  const nCellsRna = useSelector((s) => (s.SingleCell.rnaFusions?.status === "ok" ? s.SingleCell.rnaFusions.data.nCellsRna : null));
  const [fusion, setFusion] = useState(null);
  if (!items.length) return null;
  const pick = (h) => (h.kind === "fusion" ? setFusion(h.fusion) : onPickSplicing && onPickSplicing(h.finding));
  return (
    <>
      <Alert
        type={items.some((h) => h.severity === "high") ? "warning" : "info"}
        showIcon={false}
        style={{ padding: "6px 12px" }}
        message={
          <Space direction="vertical" size={0} style={{ width: "100%" }}>
            <Space size={4}>
              <Text strong>{t(`${k}.findings-strip-title`)}</Text>
              <HintLine inline text={t(`${k}.findings-help`)} />
              {items.length > max && onShowAll && (
                <Link onClick={onShowAll} style={{ fontSize: TYPE.label }}>
                  {t("components.single-cell.rna-findings.more", { count: items.length - max })}
                </Link>
              )}
            </Space>
            {items.slice(0, max).map((h) => (
              <div key={h.id} style={{ fontSize: TYPE.label, lineHeight: 1.6 }}>
                <FindingKindTag item={h} />
                <Link onClick={() => pick(h)} style={{ fontSize: TYPE.label }}>
                  {h.text}
                </Link>
              </div>
            ))}
          </Space>
        }
      />
      <RnaFusionModal fusion={fusion} nCellsRna={nCellsRna} onClose={() => setFusion(null)} />
    </>
  );
}
