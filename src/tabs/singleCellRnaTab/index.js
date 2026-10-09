import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Col, Empty, Row, Space, Switch, Tabs, Typography } from "antd";
import GeneExplorerCard from "../../components/singleCell/rna/geneExplorerCard";
import CompositionCard from "../../components/singleCell/rna/compositionCard";
import MarkersCard from "../../components/singleCell/rna/markersCard";
import UmapPanel from "../../components/singleCell/umapPanel";
import RnaGroupsCard from "../../components/singleCell/rna/rnaGroupsCard";
import SavedGroupsBar from "../../components/singleCell/savedGroupsBar";
import { ThemeSelect } from "../../components/singleCell/paletteEditor";
import HelpDrawer from "../../components/singleCell/helpDrawer";
import DePanel from "../../components/singleCell/rna/dePanel";
import ViolinPanel from "../../components/singleCell/rna/violinPanel";
import PhyloExpressionCard from "../../components/singleCell/rna/phyloExpressionCard";
import HeritabilityCard from "../../components/singleCell/rna/heritabilityCard";
import useRnaData from "../../components/singleCell/rna/useRnaData";
import CompareGroupsPanel from "../../components/singleCell/compareGroupsPanel";
import AnalysisResultsPanel from "../../components/singleCell/analysisResultsPanel";
import RnaFusionsCard from "../../components/singleCell/rna/rnaFusionsCard";
import SplicingCard from "../../components/singleCell/rna/splicingCard";
import RnaFindingsStrip from "../../components/singleCell/rna/rnaFindingsStrip";
import { rnaFindingCounts } from "../../helpers/singleCell/rnaHeadlineFindings";
import scaActions from "../../redux/scAnalysis/actions";
import singleCellActions from "../../redux/singleCell/actions";
import Wrapper from "./index.style";
import SingleCellWrapper from "../../components/singleCell/index.style";
import { SC_GUTTER } from "../../components/singleCell/density";

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
  const { summary, matrix, error, rowsFor, excluded, tumorOnly } = useRnaData();
  const service = useSelector((state) => state.ScAnalysis.service);
  const expressionGene = useSelector((state) => state.ScAnalysis.expression.gene);
  const [violinGenes, setViolinGenes] = useState([]);
  const [section, setSection] = useState("overview");
  const geneList = useSelector((state) => state.ScAnalysis.geneList);
  // fusions / splicing tab only when the back end wrote either file (or it failed to parse)
  const hasFusions = useSelector((state) => ["ok", "error"].includes(state.SingleCell.rnaFusions?.status));
  const hasSplicing = useSelector((state) => ["ok", "error"].includes(state.SingleCell.rnaSplicing?.status));
  // notable splicing findings + tier 1–2 fusion pairs, on the sub-tab label
  const splicingFindings = useSelector((state) => (state.SingleCell.rnaSplicing?.status === "ok" ? state.SingleCell.rnaSplicing.data.findings : null));
  const fusionList = useSelector((state) => (state.SingleCell.rnaFusions?.status === "ok" ? state.SingleCell.rnaFusions.data.fusions : null));
  const findingCount = useMemo(() => rnaFindingCounts({ splicing: splicingFindings || [], fusions: fusionList || [] }).total, [splicingFindings, fusionList]);
  // a splicing finding picked in the strip: open the sub-tab and the finding in the splicing card
  const [spliceFocus, setSpliceFocus] = useState(null);
  // Violins follow the genes picked in the volcano or table.
  useEffect(() => {
    if (geneList.length) setViolinGenes(geneList.slice(0, 48));
  }, [geneList]);

  if (!summary) {
    return (
      <Wrapper>
        <Empty description={t("components.single-cell.rna.no-rna")} />
      </Wrapper>
    );
  }
  const showGene = (gene) => {
    setViolinGenes((genes) => [...genes.filter((g) => g !== gene), gene].slice(-48));
    dispatch(scaActions.fetchExpression(gene));
  };

  return (
    <Wrapper>
      <SingleCellWrapper>
      <Row gutter={SC_GUTTER}>
        {error && (
          <Col span={24}>
            <Alert type="error" showIcon message={t("components.single-cell.rna.matrix-error")} description={error} />
          </Col>
        )}
        <Col span={24}>
          <Space wrap size="large">
            <Space>
              <Text type="secondary">{t("components.single-cell.palette.theme")}</Text>
              <ThemeSelect />
            </Space>
            <HelpDrawer compact />
            <Space>
              <Switch size="small" checked={tumorOnly} onChange={(v) => dispatch(singleCellActions.updateLayout({ rnaTumorOnly: v }))} />
              <Text>{t("components.single-cell.rna.tumor-only")}</Text>
              {tumorOnly && <Text type="secondary">{t("components.single-cell.rna.tumor-only-note", { count: excluded, kept: summary.cells.length })}</Text>}
            </Space>
          </Space>
        </Col>
        <Col span={24}>
          <SavedGroupsBar />
        </Col>
        <Col span={24}>
          <RnaFindingsStrip
            onPickSplicing={(f) => {
              setSection("fusions");
              setSpliceFocus({ id: f.id, at: Date.now() });
            }}
            onShowAll={() => setSection("fusions")}
          />
        </Col>
        <Col span={24}>
          <Tabs
            size="small"
            activeKey={section}
            onChange={setSection}
            items={[
              {
                key: "overview",
                label: t("components.single-cell.rna.section-overview"),
                children: (
                  <Row gutter={SC_GUTTER}>
                    <Col xs={24} xxl={12}>
                      <UmapPanel />
                    </Col>
                    <Col xs={24} xxl={12}>
                      <CompositionCard summary={summary} />
                    </Col>
                  </Row>
                ),
              },
              {
                key: "genes",
                label: t("components.single-cell.rna.section-genes"),
                children: (
                  <Row gutter={SC_GUTTER}>
                    <Col span={24}>
                      <MarkersCard summary={summary} matrix={matrix} />
                    </Col>
                    <Col span={24}>
                      <GeneExplorerCard summary={summary} matrix={matrix} defaultGene={expressionGene || "EGFR"} />
                    </Col>
                    <Col span={24}>
                      <PhyloExpressionCard summary={summary} matrix={matrix} />
                    </Col>
                    <Col span={24}>
                      <HeritabilityCard summary={summary} matrix={matrix} />
                    </Col>
                  </Row>
                ),
              },
              {
                key: "compare",
                label: t("components.single-cell.rna.section-compare"),
                children: (
                  <Row gutter={SC_GUTTER}>
                    <Col span={24}>
                      <RnaGroupsCard summary={summary} />
                    </Col>
                    <Col span={24}>
                      <DePanel summary={summary} matrix={matrix} rowsFor={rowsFor} onGene={showGene} selectedGene={expressionGene} onViolins={setViolinGenes} />
                    </Col>
                    <Col span={24}>
                      <ViolinPanel summary={summary} matrix={matrix} rowsFor={rowsFor} genes={violinGenes} onGenesChange={setViolinGenes} />
                    </Col>
                  </Row>
                ),
              },
              ...(hasFusions || hasSplicing
                ? [
                    {
                      key: "fusions",
                      label: (
                        <span>
                          {t("components.single-cell.rna.section-fusions")}
                          {findingCount > 0 && <Text type="danger"> · {t("components.single-cell.rna.section-fusions-count", { count: findingCount })}</Text>}
                        </span>
                      ),
                      children: (
                        <Row gutter={SC_GUTTER}>
                          {hasFusions && (
                            <Col span={24}>
                              <RnaFusionsCard summary={summary} />
                            </Col>
                          )}
                          {hasSplicing && (
                            <Col span={24}>
                              <SplicingCard summary={summary} focus={spliceFocus} />
                            </Col>
                          )}
                        </Row>
                      ),
                    },
                  ]
                : []),
              {
                key: "server",
                label: (
                  <span>
                    {t("components.single-cell.rna.section-server")}
                    {service !== "ready" && <Text type="secondary"> · {t("components.single-cell.rna.server-off")}</Text>}
                  </span>
                ),
                children: (
                  <Row gutter={SC_GUTTER}>
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
      </SingleCellWrapper>
    </Wrapper>
  );
}
