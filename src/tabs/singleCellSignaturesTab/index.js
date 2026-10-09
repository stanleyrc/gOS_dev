import React from "react";
import { useSelector } from "react-redux";
import { Col, Row } from "antd";
import SignatureSetsCard from "../../components/singleCell/signatures/signatureSetsCard";
import SignatureComparisonCard from "../../components/singleCell/signatures/signatureComparisonCard";
import SignatureTreeCard from "../../components/singleCell/signatures/signatureTreeCard";
import SingleCellWrapper from "../../components/singleCell/index.style";
import { SC_GUTTER } from "../../components/singleCell/density";

/**
 * SBS signatures of a single-cell patient: one site set in depth (catalog,
 * backend and browser fits with bootstrap intervals, decomposed catalogs),
 * every set compared, and signatures along the phylogeny per clone / clade.
 */
export default function SingleCellSignaturesTab() {
  const hasTree = useSelector((state) => state.SingleCell.tree.status === "ok");
  return (
    <SingleCellWrapper>
      <Row gutter={SC_GUTTER}>
        <Col span={24}>
          <SignatureComparisonCard />
        </Col>
        <Col span={24}>
          <SignatureSetsCard />
        </Col>
        {hasTree && (
          <Col span={24}>
            <SignatureTreeCard />
          </Col>
        )}
      </Row>
    </SingleCellWrapper>
  );
}
