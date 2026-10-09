import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Progress,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import { ExperimentOutlined, SwapOutlined } from "@ant-design/icons";
import scaActions from "../../redux/scAnalysis/actions";
import { searchGenes } from "../../redux/scAnalysis/api";
import { naturalCompare } from "../../helpers/singleCell/matrix";
import { SC_GUTTER_INNER } from "./density";

const { Text } = Typography;

const STATE_COLOR = { queued: "default", running: "processing", done: "success", failed: "error" };

/** Build a group entry list for the current patient. */
const asGroups = (patient, cellIds) =>
  cellIds.length ? [{ patient, cells: [...cellIds] }] : [];

function ParamField({ name, spec }) {
  const label = spec.label || name;
  if (spec.type === "enum") {
    return (
      <Form.Item name={name} label={label} initialValue={spec.default}>
        <Select
          size="small"
          style={{ minWidth: 140 }}
          options={(spec.options || []).map((o) => ({ value: o, label: o }))}
        />
      </Form.Item>
    );
  }
  if (spec.type === "boolean") {
    return (
      <Form.Item name={name} label={label} initialValue={spec.default} valuePropName="checked">
        <Switch size="small" />
      </Form.Item>
    );
  }
  return (
    <Form.Item name={name} label={label} initialValue={spec.default}>
      <InputNumber
        size="small"
        min={spec.min}
        max={spec.max}
        step={spec.type === "integer" ? 1 : 0.05}
        precision={spec.type === "integer" ? 0 : undefined}
        style={{ width: 110 }}
      />
    </Form.Item>
  );
}

/**
 * Group builder + analysis launcher. Groups come from the current selection
 * (tree, heatmap or cell table) or from clone presets; analyses and their
 * parameters come from the service catalogue.
 */
export default function CompareGroupsPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const sca = useSelector((state) => state.ScAnalysis);
  const { cells, order, selectedCellIds, patient } = useSelector((state) => state.SingleCell);
  const [analysisId, setAnalysisId] = useState(null);
  const [form] = Form.useForm();
  const [geneOptions, setGeneOptions] = useState([]);

  const groupAnalyses = useMemo(
    () => sca.catalogue.filter((a) => (a.inputs || []).includes("groups")),
    [sca.catalogue]
  );
  const analysis =
    groupAnalyses.find((a) => a.id === analysisId) || groupAnalyses[0] || null;
  const clones = useMemo(
    () => [...new Set(cells.map((c) => c.clone_id).filter((c) => c != null))].sort(naturalCompare),
    [cells]
  );

  if (sca.service === "off") return null;

  const patientId = patient?.caseReportId;
  const setFromSelection = (side) =>
    dispatch(
      scaActions.setGroup(
        side,
        asGroups(patientId, selectedCellIds),
        t("components.single-cell.compare.selection-label", { count: selectedCellIds.length })
      )
    );
  const cloneVsRest = (clone) => {
    const inClone = order.filter((id) => cells.find((c) => c.cell_id === id)?.clone_id === clone);
    const rest = order.filter((id) => !inClone.includes(id));
    dispatch(scaActions.setGroup("A", asGroups(patientId, inClone), t("components.single-cell.compare.clone-label", { clone })));
    dispatch(scaActions.setGroup("B", asGroups(patientId, rest), t("components.single-cell.compare.rest-label")));
  };
  const swap = () => {
    const { A, B } = sca.groups;
    dispatch(scaActions.setGroup("A", B?.groups || [], B?.label));
    dispatch(scaActions.setGroup("B", A?.groups || [], A?.label));
  };
  const run = () => {
    form.validateFields().then((values) => dispatch(scaActions.submitJob(analysis.id, values)));
  };

  const groupSlot = (side) => {
    const g = sca.groups[side];
    return (
      <Space size={6} wrap>
        <Tag color={side === "A" ? "magenta" : "geekblue"} style={{ marginRight: 0 }}>
          {side}
        </Tag>
        {g ? (
          <Text>
            {g.label} · {t("components.single-cell.heatmap.cell-count", { count: g.nCells })}
          </Text>
        ) : (
          <Text type="secondary">{t("components.single-cell.compare.empty-group")}</Text>
        )}
        <Button size="small" disabled={!selectedCellIds.length} onClick={() => setFromSelection(side)}>
          {t("components.single-cell.compare.set-from-selection")}
        </Button>
      </Space>
    );
  };

  const rnaMissing = sca.service === "ready" && sca.rna && !sca.rna.available;
  const recent = sca.history.slice(0, 8);

  return (
    <Card
      size="small"
      title={
        <Space>
          <ExperimentOutlined />
          <span>{t("components.single-cell.compare.title")}</span>
          {sca.rna?.available && (
            <Text type="secondary">
              {t("components.single-cell.compare.rna-summary", {
                cells: sca.rna.n_cells,
                matched: sca.rna.n_matched,
                genes: sca.rna.n_genes,
              })}
            </Text>
          )}
        </Space>
      }
    >
      {sca.service === "error" && (
        <Alert
          type="warning"
          showIcon
          message={t("components.single-cell.compare.service-error")}
          description={sca.serviceError}
        />
      )}
      {rnaMissing && (
        <Alert type="info" showIcon message={t("components.single-cell.compare.no-rna")} />
      )}
      {sca.service === "ready" && sca.rna?.available && (
        <Row gutter={SC_GUTTER_INNER}>
          <Col xs={24} xl={12}>
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              {groupSlot("A")}
              {groupSlot("B")}
              <Space wrap>
                <Select
                  size="small"
                  style={{ width: 200 }}
                  placeholder={t("components.single-cell.compare.clone-vs-rest")}
                  value={null}
                  disabled={!clones.length}
                  onChange={cloneVsRest}
                  options={clones.map((c) => ({ value: c, label: t("components.single-cell.compare.clone-label", { clone: c }) }))}
                />
                <Button size="small" icon={<SwapOutlined />} onClick={swap} disabled={!sca.groups.A && !sca.groups.B}>
                  {t("components.single-cell.compare.swap")}
                </Button>
                <Button size="small" onClick={() => dispatch(scaActions.clearGroups())}>
                  {t("components.single-cell.selection.clear")}
                </Button>
              </Space>
              <Space wrap>
                <Text type="secondary">{t("components.single-cell.compare.gene-strip")}</Text>
                <AutoComplete
                  size="small"
                  style={{ width: 180 }}
                  placeholder={t("components.single-cell.compare.gene-placeholder")}
                  options={geneOptions}
                  onSearch={(q) => {
                    if (!q) return setGeneOptions([]);
                    searchGenes(sca.base, sca.context.dataset, sca.context.patient, q)
                      .then((r) => setGeneOptions(r.genes.map((g) => ({ value: g }))))
                      .catch(() => setGeneOptions([]));
                  }}
                  onSelect={(gene) => dispatch(scaActions.fetchExpression(gene))}
                />
                {sca.expression.gene && (
                  <Tag closable onClose={() => dispatch(scaActions.clearExpression())}>
                    {sca.expression.gene}
                    {sca.expression.status === "loading" ? " …" : ""}
                  </Tag>
                )}
                {sca.expression.status === "error" && <Text type="danger">{sca.expression.error}</Text>}
              </Space>
            </Space>
          </Col>
          <Col xs={24} xl={12}>
            {analysis ? (
              <>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Select
                    size="small"
                    style={{ width: 300 }}
                    value={analysis.id}
                    onChange={(id) => {
                      setAnalysisId(id);
                      form.resetFields();
                    }}
                    options={groupAnalyses.map((a) => ({ value: a.id, label: a.title }))}
                  />
                  <Button
                    type="primary"
                    size="small"
                    loading={sca.submitting}
                    disabled={!sca.groups.A || !sca.groups.B}
                    onClick={run}
                  >
                    {t("components.single-cell.compare.run")}
                  </Button>
                </Space>
                {analysis.description && (
                  <div>
                    <Text type="secondary">{analysis.description}</Text>
                  </div>
                )}
                <Form form={form} layout="inline" size="small" key={analysis.id} style={{ marginTop: 8 }}>
                  {Object.entries(analysis.params || {}).map(([name, spec]) => (
                    <ParamField key={name} name={name} spec={spec} />
                  ))}
                </Form>
                {sca.submitError && (
                  <Alert type="error" showIcon style={{ marginTop: 8 }} message={sca.submitError} />
                )}
              </>
            ) : (
              <Text type="secondary">{t("components.single-cell.compare.no-analyses")}</Text>
            )}
          </Col>
          {recent.length > 0 && (
            <Col span={24}>
              <Text strong>{t("components.single-cell.compare.history")}</Text>
              <div className="sc-history">
                {recent.map((job) => (
                  <button
                    type="button"
                    key={job.id}
                    className={`sc-history-item${job.id === sca.activeJobId ? " active" : ""}`}
                    onClick={() => dispatch(scaActions.selectJob(job.id))}
                  >
                    <Tag color={STATE_COLOR[job.state]}>{t(`components.single-cell.compare.state.${job.state}`)}</Tag>
                    <span>{job.title || job.request?.analysis}</span>
                    {job.labels?.A && (
                      <Text type="secondary">
                        {" "}
                        · {job.labels.A} vs {job.labels.B}
                      </Text>
                    )}
                    {!["done", "failed"].includes(job.state) && (
                      <Progress percent={Math.round((job.progress || 0) * 100)} size="small" style={{ width: 120, margin: "0 0 0 8px" }} />
                    )}
                  </button>
                ))}
              </div>
            </Col>
          )}
        </Row>
      )}
      {sca.service === "loading" && <Text type="secondary">{t("components.single-cell.compare.connecting")}</Text>}
    </Card>
  );
}
