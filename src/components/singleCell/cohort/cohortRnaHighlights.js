import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Col, Progress, Row, Space, Tag, Tooltip, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import { cohortRnaHighlights } from "../../../helpers/singleCell/rnaFindings";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import HintLine, { Provenance } from "../hintLine";
import usePlotTheme from "../usePlotTheme";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { STORY_SERIES } from "../../../helpers/singleCell/story";
import { SC_GUTTER_INNER } from "../density";

const { Text, Title } = Typography;
const pct = d3.format(".0%");

/** Cohort-level RNA key findings: dominant states, clone-state links, expressed / silent drivers, shared markers. */
export default function CohortRnaHighlights({ cohortRna }) {
  const { t } = useTranslation("common");
  const theme = usePlotTheme();
  const h = useMemo(() => cohortRnaHighlights(cohortRna.byPatient), [cohortRna.byPatient]);
  const k = (key, opts) => t(`components.single-cell.rna-findings.${key}`, opts);
  if (!h.nPatients && cohortRna.done >= cohortRna.total) return null;
  const stateColors = annotationColors(h.dominant.map((d) => d.state));
  const none = <Text type="secondary">{k("cohort-none")}</Text>;
  return (
    <Card size="small" title={<Space><ExperimentOutlined />{k("cohort-title")}<HintLine inline text={k("help")} /><Provenance id="rnaFindings" /></Space>}>
      {cohortRna.done < cohortRna.total && (
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: TYPE.label }}>{k("cohort-progress", { done: cohortRna.done, total: cohortRna.total })}</Text>
          <Progress percent={Math.round((100 * cohortRna.done) / Math.max(1, cohortRna.total))} size="small" showInfo={false} />
        </div>
      )}
      <Row gutter={SC_GUTTER_INNER}>
        <Col xs={24} md={12} xl={8}>
          <Title level={5} className="sc-section-title">{k("cohort-dominant")}</Title>
          {h.dominant.length ? h.dominant.map((d) => (
            <div key={d.patient} style={{ fontSize: TYPE.label }}>
              <Text strong style={{ display: "inline-block", width: 64 }}>{d.patient}</Text>
              <Tag color={stateColors[d.state]}>{d.state}</Tag>
              <Text type="secondary">{pct(d.share)}</Text>
            </div>
          )) : none}
          <Title level={5} className="sc-section-title">{k("cohort-cycling")}</Title>
          {h.cycling.length ? h.cycling.map((c) => (
            <div key={c.patient} style={{ fontSize: TYPE.label }}>
              <Text strong style={{ display: "inline-block", width: 64 }}>{c.patient}</Text>
              <svg width={100} height={8} style={{ marginRight: 6 }}><rect width={100} height={8} rx={2} fill={theme.empty} /><rect width={100 * c.fraction} height={8} rx={2} fill={STORY_SERIES[theme.mode === "dark" ? "dark" : "light"][1]} /></svg>
              <Text>{pct(c.fraction)}</Text>
              {c.high.length > 0 && <Text type="secondary">{` · ${c.high.join(", ")} ↑`}</Text>}
            </div>
          )) : none}
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Title level={5} className="sc-section-title">{k("cohort-dosage")}</Title>
          {h.dosage.length ? h.dosage.map((d) => (
            <div key={d.gene} style={{ fontSize: TYPE.label }}>
              <Text strong>{d.gene}</Text>{" "}
              {d.patients.map((p) => <Tag key={p.patient}>{`${p.patient} log2FC ${p.log2FC.toFixed(1)}`}</Tag>)}
            </div>
          )) : none}
          <Title level={5} className="sc-section-title">{k("cohort-silent")}</Title>
          {h.silent.length ? (
            <div style={{ fontSize: TYPE.label }}>
              {h.silent.map((d) => <Tooltip key={d.gene} title={d.patients.join(", ")}><Tag>{`${d.gene} (${d.patients.join(", ")})`}</Tag></Tooltip>)}
            </div>
          ) : none}
        </Col>
        <Col xs={24} md={24} xl={8}>
          <Title level={5} className="sc-section-title">{k("cohort-clone-state", { count: h.cloneStatePatients.length, tested: h.testedStatePatients.length })}</Title>
          {h.cloneState.length ? h.cloneState.map((x) => (
            <div key={`${x.patient}-${x.clone}-${x.state}`} style={{ fontSize: TYPE.label }}>
              <Text strong style={{ display: "inline-block", width: 64 }}>{x.patient}</Text>
              <Text>{`${x.clone}: `}</Text>
              <Tag color={annotationColors([x.state])[x.state]}>{x.state}</Tag>
              <Text type="secondary">{`${pct(x.fraction)} · q ${x.q < 1e-4 ? "< 1e-4" : x.q.toFixed(3)}`}</Text>
            </div>
          )) : none}
          <Title level={5} className="sc-section-title">{k("cohort-markers")}</Title>
          {h.recurrentMarkers.length ? (
            <div style={{ fontSize: TYPE.label }}>
              {h.recurrentMarkers.slice(0, 20).map((m) => <Tag key={m.gene}>{`${m.gene} (${m.patients.join(", ")})`}</Tag>)}
            </div>
          ) : none}
        </Col>
      </Row>
    </Card>
  );
}
