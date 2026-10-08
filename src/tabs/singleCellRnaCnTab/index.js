import React from "react";
import { useTranslation } from "react-i18next";
import { Col, Empty, Row } from "antd";
import DosagePanel from "../../components/singleCell/rna/dosagePanel";
import useRnaData from "../../components/singleCell/rna/useRnaData";
import SingleCellWrapper from "../../components/singleCell/index.style";

/**
 * How copy number and expression relate in the same cells (DNA + RNA):
 * dosage vs expression per gene and the genome-wide dosage ranking.
 */
export default function SingleCellRnaCnTab() {
  const { t } = useTranslation("common");
  const { summary, matrix, rowOfId } = useRnaData();
  if (!summary) return <Empty description={t("components.single-cell.rna.no-rna")} />;
  return (
    <SingleCellWrapper>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <DosagePanel summary={summary} matrix={matrix} rowOfId={rowOfId} />
        </Col>
      </Row>
    </SingleCellWrapper>
  );
}
