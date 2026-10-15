import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Col, Row, Space, Typography } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import { cohortHeadline } from "../../../helpers/singleCell/cohortHeadline";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";
import { SC_GUTTER_INNER } from "../density";

const { Text } = Typography;

/**
 * The cohort's major findings, top of the Overview: a few statements with
 * their numbers (shared truncal drivers, ecDNA prevalence, subclonal drivers),
 * each linking to the view that shows the evidence. Per-patient findings
 * live in Key findings; this card only states the cross-patient pattern.
 */
export default function CohortHeadline({ patients, nPatients, nCells, loading = false, hotspots = null, onView, onPatient }) {
  const { t } = useTranslation("common");
  const k = (key, opts) => t(`components.single-cell.cohort.${key}`, opts);
  const items = useMemo(() => cohortHeadline(patients, { hotspots }), [patients, hotspots]);
  return (
    <Card
      size="small"
      className="sc-headline"
      title={
        <Space size={10} align="baseline">
          <span style={{ fontSize: TYPE.title + 2, fontWeight: 600 }}>{k("headline-title")}</span>
          <Text type="secondary" style={{ fontSize: TYPE.label, fontWeight: 400 }}>{k("headline-scope", { patients: nPatients, cells: nCells.toLocaleString() })}</Text>
          <Provenance id="cohortHeadline" />
        </Space>
      }
      extra={
        <Space size={4}>
          <Button size="small" type="link" onClick={() => onView("reports")}>{k("headline-more")} <ArrowRightOutlined /></Button>
          <Button size="small" type="link" onClick={() => onView("story")}>{k("headline-story")} <ArrowRightOutlined /></Button>
        </Space>
      }
    >
      {!items.length ? (
        <Text type="secondary">{loading ? k("headline-loading") : k("headline-none")}</Text>
      ) : (
        <Row gutter={[SC_GUTTER_INNER[0] * 2, SC_GUTTER_INNER[1]]}>
          {items.map((h) => (
            <Col key={h.key} xs={24} lg={8} className="sc-headline-item">
              <div className="sc-headline-number">
                {h.value}
                <span className="sc-headline-total">{` / ${h.total}`}</span>
              </div>
              <div className="sc-headline-text">{h.title}</div>
              {h.detail && <div className="sc-headline-detail">{h.detail}</div>}
              <div className="sc-headline-foot">
                {h.patients.map((p, i) => (
                  <React.Fragment key={p}>
                    {i > 0 && <span className="sc-headline-sep">·</span>}
                    <button type="button" className="sc-headline-patient" onClick={() => onPatient(p)}>{p}</button>
                  </React.Fragment>
                ))}
                <Button size="small" type="link" onClick={() => onView(h.view)} style={{ paddingInline: 6, fontSize: TYPE.tick }}>
                  {`${t(`components.single-cell.cohort.view-${h.view}`)} `}
                  <ArrowRightOutlined />
                </Button>
              </div>
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}
