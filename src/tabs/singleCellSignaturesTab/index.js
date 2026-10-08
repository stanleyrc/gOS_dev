import React from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Col, Row } from "antd";
import SignatureSetsCard from "../../components/singleCell/signatures/signatureSetsCard";
import SignatureComparisonCard from "../../components/singleCell/signatures/signatureComparisonCard";
import PhyloBarsCard from "../../components/singleCell/phyloBarsCard";
import SingleCellWrapper from "../../components/singleCell/index.style";

/**
 * SBS signatures of a single-cell patient: one site set in depth (catalog,
 * backend and browser fits with bootstrap intervals, decomposed catalogs),
 * every set compared, and signatures along the phylogeny per clone / clade.
 */
export default function SingleCellSignaturesTab() {
  const { t } = useTranslation("common");
  const hasTree = useSelector((state) => state.SingleCell.tree.status === "ok");
  return (
    <SingleCellWrapper>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <SignatureComparisonCard />
        </Col>
        <Col span={24}>
          <SignatureSetsCard />
        </Col>
        {hasTree && (
          <Col span={24}>
            <PhyloBarsCard defaultTracks={["signatures", "snv_count"]} defaultMode="clones" title={t("components.single-cell.signatures.tree-title")} />
          </Col>
        )}
      </Row>
    </SingleCellWrapper>
  );
}
