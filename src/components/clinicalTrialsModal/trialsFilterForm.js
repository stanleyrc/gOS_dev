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

    const sectionLabel = {
      fontSize: 11,
      fontWeight: 600,
      color: "#888",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      marginBottom: 8,
    };
    const fieldStyle = { marginBottom: 0 };

    return (
      <Form layout="vertical" style={{ marginBottom: 16 }}>
        {/* Top row: Disease, Treatment, Eligibility */}
        <Row gutter={32} style={{ marginBottom: 16 }}>
          {/* Disease */}
          <Col span={10}>
            <div style={sectionLabel}>Disease</div>
            <Row gutter={12}>
              <Col span={10}>
                <Form.Item label={t("components.clinical-trials-modal.cancer-type") || "Cancer Type"} style={fieldStyle}>
                  <Select
                    value={cancerTypeFilter || undefined}
                    options={getCancerTypeOptions()}
                    onChange={onCancerTypeChange}
                    placeholder="Select"
                    allowClear
                    showSearch
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={7}>
                <Form.Item label="Stage" style={fieldStyle}>
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
              <Col span={7}>
                <Form.Item label={t("components.clinical-trials-modal.biomarkers") || "Biomarkers"} style={fieldStyle}>
                  <Input
                    value={biomarkerInput}
                    onChange={(e) => onBiomarkerChange(e.target.value)}
                    placeholder="KRAS+, EGFR-"
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>

          {/* Treatment */}
          <Col span={6}>
            <div style={sectionLabel}>Treatment</div>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item label="Class" style={fieldStyle}>
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
              <Col span={12}>
                <Form.Item label={t("components.clinical-trials-modal.line-of-therapy") || "Line"} style={fieldStyle}>
                  <Select
                    value={lineOfTherapyFilter}
                    options={LINE_OF_THERAPY_OPTIONS}
                    onChange={onLineOfTherapyChange}
                    placeholder="All"
                    allowClear
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>

          {/* Eligibility */}
          <Col span={8}>
            <div style={sectionLabel}>Eligibility</div>
            <Row gutter={24}>
              <Col>
                <Form.Item label="Prior Therapy" style={fieldStyle}>
                  <Space size="middle">
                    <Checkbox checked={priorTkiFilter} onChange={(e) => onPriorTkiChange(e.target.checked)}>
                      TKI
                    </Checkbox>
                    <Checkbox checked={priorIoFilter} onChange={(e) => onPriorIoChange(e.target.checked)}>
                      IO
                    </Checkbox>
                    <Checkbox checked={priorPlatinumFilter} onChange={(e) => onPriorPlatinumChange(e.target.checked)}>
                      Platinum
                    </Checkbox>
                  </Space>
                </Form.Item>
              </Col>
              <Col>
                <Form.Item label="Display" style={fieldStyle}>
                  <Checkbox checked={showSocAlways} onChange={(e) => onShowSocAlwaysChange(e.target.checked)}>
                    Always Show SoC
                  </Checkbox>
                </Form.Item>
              </Col>
            </Row>
          </Col>
        </Row>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #e8e8e8", marginBottom: 16 }} />

        {/* Bottom row: Trial Details + Actions */}
        <Row gutter={32} align="bottom">
          <Col flex="auto">
            <div style={sectionLabel}>Trial Details</div>
            <Row gutter={12}>
              <Col span={6}>
                <Form.Item label="NCT ID" style={fieldStyle}>
                  <Input
                    value={nctIdInput}
                    onChange={(e) => onNctIdChange(e.target.value)}
                    placeholder="NCT00003869"
                  />
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item label={t("components.clinical-trials-modal.phase") || "Phase"} style={fieldStyle}>
                  <Select
                    value={phaseFilter}
                    options={PHASE_OPTIONS}
                    onChange={onPhaseChange}
                    placeholder="All"
                    allowClear
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={t("components.clinical-trials-modal.status") || "Status"} style={fieldStyle}>
                  <Select
                    value={statusFilter}
                    options={STATUS_OPTIONS}
                    onChange={onStatusChange}
                    placeholder="All"
                    allowClear
                  />
                </Form.Item>
              </Col>
              <Col span={7}>
                <Form.Item label={t("components.clinical-trials-modal.outcome-type") || "Outcome"} style={fieldStyle}>
                  <Select
                    value={selectedOutcomeType}
                    options={OUTCOME_TYPES.map((o) => ({ label: o, value: o }))}
                    onChange={onOutcomeTypeChange}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>

          {/* Actions - separate from all sections */}
          <Col flex="none">
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
