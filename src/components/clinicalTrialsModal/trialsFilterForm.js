import React, { Component } from "react";
import { Form, Row, Col, Select, Input, Checkbox, Button, Space } from "antd";
import { PHASE_OPTIONS, STATUS_OPTIONS, LINE_OF_THERAPY_OPTIONS, OUTCOME_TYPES } from "./constants";

class TrialsFilterForm extends Component {
  render() {
    const {
      t,
      cancerTypeFilter,
      biomarkerInput,
      phaseFilter,
      statusFilter,
      lineOfTherapyFilter,
      selectedOutcomeType,
      nctIdInput,
      treatmentClassFilter,
      cancerStageFilter,
      priorTkiFilter,
      priorIoFilter,
      priorPlatinumFilter,
      showSocAlways,
      // Option generators
      getCancerTypeOptions,
      getTreatmentClassOptions,
      getCancerStageOptions,
      // Handlers
      onCancerTypeChange,
      onBiomarkerChange,
      onPhaseChange,
      onStatusChange,
      onLineOfTherapyChange,
      onOutcomeTypeChange,
      onNctIdChange,
      onTreatmentClassChange,
      onCancerStageChange,
      onPriorTkiChange,
      onPriorIoChange,
      onPriorPlatinumChange,
      onShowSocAlwaysChange,
      onClear,
      onReset,
    } = this.props;

    return (
      <Form layout="vertical" style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label={t("components.clinical-trials-modal.cancer-type") || "Cancer Type"}>
              <Select
                value={cancerTypeFilter || undefined}
                options={getCancerTypeOptions()}
                onChange={onCancerTypeChange}
                placeholder="Select cancer type"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  option.label.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label={t("components.clinical-trials-modal.biomarkers") || "Biomarkers"}>
              <Input
                value={biomarkerInput}
                onChange={(e) => onBiomarkerChange(e.target.value)}
                placeholder="e.g., KRAS+, EGFR-, MET"
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label={t("components.clinical-trials-modal.line-of-therapy") || "Line of Therapy"}>
              <Select
                value={lineOfTherapyFilter}
                options={LINE_OF_THERAPY_OPTIONS}
                onChange={onLineOfTherapyChange}
                placeholder="All"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label={t("components.clinical-trials-modal.phase") || "Phase"}>
              <Select
                value={phaseFilter}
                options={PHASE_OPTIONS}
                onChange={onPhaseChange}
                placeholder="All"
                allowClear
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label={t("components.clinical-trials-modal.status") || "Status"}>
              <Select
                value={statusFilter}
                options={STATUS_OPTIONS}
                onChange={onStatusChange}
                placeholder="All"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label={t("components.clinical-trials-modal.outcome-type") || "Outcome Type"}>
              <Select
                value={selectedOutcomeType}
                options={OUTCOME_TYPES.map((o) => ({ label: o, value: o }))}
                onChange={onOutcomeTypeChange}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="NCT ID">
              <Input
                value={nctIdInput}
                onChange={(e) => onNctIdChange(e.target.value)}
                placeholder="e.g., NCT00003869, NCT01234567"
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Treatment Class">
              <Select
                value={treatmentClassFilter}
                options={getTreatmentClassOptions()}
                onChange={onTreatmentClassChange}
                placeholder="All"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  option.label.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label="Cancer Stage">
              <Select
                value={cancerStageFilter}
                options={getCancerStageOptions()}
                onChange={onCancerStageChange}
                placeholder="All"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  option.label.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Eligibility Criteria">
              <Space direction="vertical" size={0}>
                <Checkbox checked={priorTkiFilter} onChange={(e) => onPriorTkiChange(e.target.checked)}>
                  Prior TKI
                </Checkbox>
                <Checkbox checked={priorIoFilter} onChange={(e) => onPriorIoChange(e.target.checked)}>
                  Prior IO
                </Checkbox>
                <Checkbox checked={priorPlatinumFilter} onChange={(e) => onPriorPlatinumChange(e.target.checked)}>
                  Prior Platinum
                </Checkbox>
              </Space>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Options">
              <Checkbox checked={showSocAlways} onChange={(e) => onShowSocAlwaysChange(e.target.checked)}>
                Always Show SoC
              </Checkbox>
            </Form.Item>
          </Col>
          <Col span={6} style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", paddingBottom: 4 }}>
            <Space>
              <Button onClick={onClear}>Clear</Button>
              <Button onClick={onReset}>Reset</Button>
            </Space>
          </Col>
        </Row>
      </Form>
    );
  }
}

export default TrialsFilterForm;
