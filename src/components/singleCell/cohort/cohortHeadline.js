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
export default function CohortHeadline({ patients, nPatients, nCells, loading = false, onView, onPatient, tsg = null }) {
  const { t } = useTranslation("common");
  const k = (key, opts) => t(`components.single-cell.cohort.${key}`, opts);
  const items = useMemo(() => cohortHeadline(patients), [patients]);
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
      {tsg && (
        <div className="sc-headline-tsg" style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid rgba(128,128,128,0.25)" }} data-tsg-headline>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Biallelic tumour-suppressor inactivation
            <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: TYPE.label }}>
              {tsg.hasLoss ? "SNV / indel + LOH or deletion of the other copy in the same cells (per-cell allelic CN), or both copies deleted" : "not available (_cohort/tsg_loss.json: per-cell allelic LOH calls not exported)"}
            </Text>
          </div>
          {tsg.hasLoss && !tsg.summary.length && <Text type="secondary">{loading ? "loading" : "no gene meets two hits in at least 3 cells"}</Text>}
          {tsg.hasLoss &&
            tsg.summary.map((g) => (
              <div key={g.gene} style={{ fontSize: TYPE.label, lineHeight: 1.7 }}>
                <b>{g.gene}</b>
                <span style={{ margin: "0 6px" }}>{`${g.patients.length}/${nPatients}`}</span>
                {g.patients.map((p, i) => (
                  <React.Fragment key={p.patient}>
                    {i > 0 && <span className="sc-headline-sep">·</span>}
                    <button type="button" className="sc-headline-patient" title={p.text} onClick={() => onPatient(p.patient)}>
                      {`${p.patient}: ${p.combo || "?"}${p.state === "homdel" ? " (both copies lost)" : ""} ${Math.round(p.fraction * 100)}%`}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
