import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Col, Collapse, Empty, Row, Typography } from "antd";
import UmapPanel from "../../components/singleCell/umapPanel";
import RnaGroupsCard from "../../components/singleCell/rna/rnaGroupsCard";
import DePanel from "../../components/singleCell/rna/dePanel";
import ViolinPanel from "../../components/singleCell/rna/violinPanel";
import PhyloExpressionCard from "../../components/singleCell/rna/phyloExpressionCard";
import useRnaData from "../../components/singleCell/rna/useRnaData";
import CompareGroupsPanel from "../../components/singleCell/compareGroupsPanel";
import AnalysisResultsPanel from "../../components/singleCell/analysisResultsPanel";
import scaActions from "../../redux/scAnalysis/actions";
import Wrapper from "./index.style";

const { Text } = Typography;

/**
 * RNA analyses for a single-cell patient, computed in the browser from the
 * static rna/ export: UMAP (selection shared with the Single-Cell tab),
 * group builder, differential expression with enrichment and dot plot, and
 * violin plots. Server analyses (Seurat MAST, pseudobulk) sit below and need
 * the sc-api service to be reachable.
 */
export default function SingleCellRnaTab() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { summary, matrix, error, rowsFor } = useRnaData();
  const service = useSelector((state) => state.ScAnalysis.service);
  const expressionGene = useSelector((state) => state.ScAnalysis.expression.gene);
  const [violinGenes, setViolinGenes] = useState([]);
  const geneList = useSelector((state) => state.ScAnalysis.geneList);
  // Violins follow the genes picked in the volcano or table.
  useEffect(() => {
    if (geneList.length) setViolinGenes(geneList.slice(0, 8));
  }, [geneList]);

  if (!summary) {
    return (
      <Wrapper>
        <Empty description={t("components.single-cell.rna.no-rna")} />
      </Wrapper>
    );
  }
  const showGene = (gene) => {
    setViolinGenes((genes) => [...genes.filter((g) => g !== gene), gene].slice(-8));
    dispatch(scaActions.fetchExpression(gene));
  };

  return (
    <Wrapper>
      <Row gutter={[16, 16]}>
        {error && (
          <Col span={24}>
            <Alert type="error" showIcon message={t("components.single-cell.rna.matrix-error")} description={error} />
          </Col>
        )}
        <Col xs={24} xxl={12}>
          <UmapPanel />
        </Col>
        <Col xs={24} xxl={12}>
          <PhyloExpressionCard summary={summary} matrix={matrix} />
        </Col>
        <Col span={24}>
          <RnaGroupsCard summary={summary} />
        </Col>
        <Col span={24}>
          <DePanel
            summary={summary}
            matrix={matrix}
            rowsFor={rowsFor}
            onGene={showGene}
            selectedGene={expressionGene}
            onViolins={setViolinGenes}
          />
        </Col>
        <Col span={24}>
          <ViolinPanel summary={summary} matrix={matrix} rowsFor={rowsFor} genes={violinGenes} onGenesChange={setViolinGenes} />
        </Col>
        <Col span={24}>
          <Collapse
            size="small"
            items={[
              {
                key: "server",
                label: (
                  <span>
                    {t("components.single-cell.rna.server-title")}{" "}
                    <Text type="secondary">
                      · {t(service === "ready" ? "components.single-cell.rna.server-ready" : "components.single-cell.rna.server-off")}
                    </Text>
                  </span>
                ),
                children: (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <CompareGroupsPanel />
                    </Col>
                    <Col span={24}>
                      <AnalysisResultsPanel />
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        </Col>
      </Row>
    </Wrapper>
  );
}
