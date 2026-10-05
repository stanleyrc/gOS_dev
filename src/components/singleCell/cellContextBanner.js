import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Space, Tag, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import datasetsActions from "../../redux/datasets/actions";
import {
  entryType,
  patientKeyOf,
  patientRecordFor,
} from "../../helpers/singleCell/cellFiles";

const { Text } = Typography;

/** Shown on a single cell's report: which patient it belongs to, with a way back. */
export default function CellContextBanner() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const metadata = useSelector((state) => state.CaseReport.metadata) || {};
  const caseId = useSelector((state) => state.CaseReport.id);
  const dataset = useSelector((state) => state.Settings.dataset);
  const records = useSelector(
    (state) =>
      state.CaseReports.manifestRecordsByDataset?.[dataset?.id] ||
      state.CaseReports.datafiles ||
      []
  );

  const own = useMemo(
    () => records.find((r) => `${r.caseReportId ?? r.pair}` === `${caseId}`) || {},
    [records, caseId]
  );
  const record = { ...own, ...metadata };
  if (entryType(record) !== "cell") return null;

  const patient = patientRecordFor(records, record);
  const patientCaseId = patient
    ? `${patient.caseReportId ?? patient.pair}`
    : patientKeyOf(record);
  const clone = record.clone_id;

  return (
    <Alert
      type="info"
      showIcon
      icon={<ApartmentOutlined />}
      style={{ marginBottom: 12 }}
      message={
        <Space wrap>
          <Text>{t("components.single-cell.banner.cell-of")}</Text>
          <Text strong>{patientCaseId || t("components.single-cell.banner.unknown-patient")}</Text>
          {clone != null && clone !== "" && (
            <Tag>{t("components.single-cell.banner.clone", { clone })}</Tag>
          )}
        </Space>
      }
      action={
        patientCaseId && dataset ? (
          <Button
            size="small"
            onClick={() => dispatch(datasetsActions.openCaseReport(dataset.id, patientCaseId))}
          >
            {t("components.single-cell.banner.open-patient")}
          </Button>
        ) : null
      }
    />
  );
}
