import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Card, Col, Row, Space, Statistic } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import settingsActions from "../../redux/settings/actions";
import { buildPatientReport } from "../../helpers/singleCell/patientReport";
import { PatientCardBody } from "./cohort/patientCards";
import { useIsSingleCellPatient } from "./eventsToHeatmap";
import { SC_GUTTER_INNER } from "./density";
import { Provenance } from "./hintLine";

/**
 * Single-cell summary on the patient's Overall tab: the same card as the
 * cohort overview (cells, clones, clonal / subclonal drivers, signatures,
 * burden) plus quick numbers and links to the single-cell tabs.
 */
export default function ScPatientOverview() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const singleCell = useIsSingleCellPatient();
  const { patient, cells, snv, signatures, cloneColors, tree } = useSelector((s) => s.SingleCell);
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const datafiles = useSelector((s) => s.CaseReports.datafiles) || [];
  const record = datafiles.find((r) => r.entry_type === "patient" && `${r.pair}` === `${patient?.caseReportId}`);
  const report = useMemo(
    () =>
      singleCell
        ? buildPatientReport({ patient: patient?.caseReportId, events: events || [], cells, variants: snv.status === "ok" ? snv.data?.variants || [] : [], signatures: signatures.status === "ok" ? signatures.data : null })
        : null,
    [singleCell, patient, events, cells, snv, signatures]
  );
  if (!singleCell || !report) return null;
  const cloneCounts = {};
  cells.forEach((c) => {
    const k = c.clone_id == null || c.clone_id === "" ? "unassigned" : `${c.clone_id}`;
    cloneCounts[k] = (cloneCounts[k] || 0) + 1;
  });
  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={<Space><ApartmentOutlined />{t("components.single-cell.overview.title")}<Provenance id="keyFindings" /></Space>}
      extra={
        <Space>
          <Button size="small" onClick={() => dispatch(settingsActions.updateTab("7"))}>{t("containers.detail-view.tabs.tab7")}</Button>
          <Button size="small" onClick={() => dispatch(settingsActions.updateTab("12"))}>{t("containers.detail-view.tabs.tab12")}</Button>
        </Space>
      }
    >
      <Row gutter={SC_GUTTER_INNER}>
        <Col xs={24} lg={8}>
          <Space size="large" wrap>
            <Statistic title={t("components.single-cell.qc.stat-cells")} value={report.nTumorCells} suffix={`+ ${report.nNormalCells} normal`} />
            <Statistic title={t("components.single-cell.cohort.clones")} value={report.clones.length} />
            <Statistic title={t("components.single-cell.snv.category-truncal")} value={report.burden.truncal} />
            <Statistic title={t("components.single-cell.report.clonal-title", { count: "" }).replace(" ()", "")} value={report.clonal.length} />
            <Statistic title={t("components.single-cell.tree.title", { defaultValue: "Tree" })} value={tree.status === "ok" ? t(`components.single-cell.tree.${tree.method}`, { defaultValue: tree.method }) : "–"} valueStyle={{ fontSize: 16 }} />
            {record?.exported && (
              <Statistic
                title={t("components.single-cell.overview.exported")}
                value={`${record.exported}`.slice(0, 10)}
                suffix={record.export_version ? <span style={{ fontSize: 13 }}>{`skilift ${record.export_version}`}</span> : null}
                valueStyle={{ fontSize: 16 }}
              />
            )}
          </Space>
        </Col>
        <Col xs={24} lg={16}>
          <PatientCardBody report={report} cloneCounts={cloneCounts} cloneColors={cloneColors} />
        </Col>
      </Row>
    </Card>
  );
}
