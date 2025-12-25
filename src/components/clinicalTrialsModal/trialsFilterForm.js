import React, { Component } from "react";
import { Form, Row, Col, Select, Input, Checkbox, Button, Space, Alert } from "antd";
import { PHASE_OPTIONS, STATUS_OPTIONS, LINE_OF_THERAPY_OPTIONS, SOC_DISPLAY_MODE_OPTIONS } from "./constants";

class TrialsFilterForm extends Component {
  render() {
    const {
      t,
      cancerTypeFilters,
      biomarkerInput,
      phaseFilters,
      statusFilter,
      lineOfTherapyFilter,
      nctIdFilters,
      sponsorFilters,
      treatmentClassFilters,
      cancerStageFilter,
      priorTkiFilter,
      priorIoFilter,
      priorPlatinumFilter,
      socDisplayMode,
      // Option generators
      getCancerTypeOptions,
      getTreatmentClassOptions,
      getCancerStageOptions,
      getNctIdOptions,
      getSponsorOptions,
      // Handlers
      onCancerTypeChange,
      onBiomarkerChange,
      onPhaseChange,
      onStatusChange,
      onLineOfTherapyChange,
      onNctIdChange,
      onSponsorChange,
      onTreatmentClassChange,
      onCancerStageChange,
      onPriorTkiChange,
      onPriorIoChange,
      onPriorPlatinumChange,
      onSocDisplayModeChange,
      onClear,
      onReset,
      hasResults,
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
        {/* Row 1: Disease, Treatment, Eligibility */}
        <Row gutter={48} style={{ marginBottom: 20 }}>
          {/* Disease */}
          <Col flex="1">
            <div style={sectionLabel}>Disease</div>
            <Row gutter={12}>
              <Col flex="1">
                <Form.Item label={t("components.clinical-trials-modal.cancer-type") || "Cancer Type"} style={fieldStyle}>
                  <Select
                    mode="multiple"
                    value={cancerTypeFilters}
                    options={getCancerTypeOptions()}
                    onChange={onCancerTypeChange}
                    placeholder="Select"
                    allowClear
                    showSearch
                    maxTagCount="responsive"
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              </Col>
              <Col flex="1">
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
              <Col flex="1">
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
          <Col flex="1">
            <div style={sectionLabel}>Treatment</div>
            <Row gutter={12}>
              <Col flex="1">
                <Form.Item label="Class" style={fieldStyle}>
                  <Select
                    mode="multiple"
                    value={treatmentClassFilters}
                    options={getTreatmentClassOptions()}
                    onChange={onTreatmentClassChange}
                    placeholder="All"
                    allowClear
                    showSearch
                    maxTagCount="responsive"
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              </Col>
              <Col flex="1">
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
          <Col flex="1">
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
                <Form.Item label="SoC Display" style={fieldStyle}>
                  <Select
                    value={socDisplayMode}
                    options={SOC_DISPLAY_MODE_OPTIONS}
                    onChange={onSocDisplayModeChange}
                    style={{ width: 100 }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Col>
        </Row>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #e8e8e8", marginBottom: 20 }} />

        {/* Row 2: Trial Details + Actions */}
        <Row gutter={48} align="bottom">
          <Col flex="auto">
            <div style={sectionLabel}>Trial Details</div>
            <Row gutter={12} align="bottom">
              <Col flex="1">
                <Form.Item label="NCT ID" style={fieldStyle}>
                  <Select
                    mode="multiple"
                    value={nctIdFilters}
                    options={getNctIdOptions()}
                    onChange={onNctIdChange}
                    placeholder="NCT00003869"
                    allowClear
                    showSearch
                    maxTagCount="responsive"
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              </Col>
              <Col flex="1">
                <Form.Item label="Sponsor" style={fieldStyle}>
                  <Select
                    mode="multiple"
                    value={sponsorFilters}
                    options={getSponsorOptions()}
                    onChange={onSponsorChange}
                    placeholder="Select sponsor"
                    allowClear
                    showSearch
                    maxTagCount="responsive"
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              </Col>
              <Col flex="none">
                <Form.Item label={t("components.clinical-trials-modal.phase") || "Phase"} style={fieldStyle}>
                  <Checkbox.Group
                    value={phaseFilters}
                    onChange={onPhaseChange}
                    options={PHASE_OPTIONS.map((o) => ({ label: o.label.replace("Phase ", ""), value: o.value }))}
                  />
                </Form.Item>
              </Col>
              <Col flex="1">
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

        {!hasResults && (
          <Alert
            type="warning"
            showIcon
            message="No trials found for the current filter combination across all outcome measures (PFS, OS, ORR)."
            style={{ marginTop: 16 }}
          />
        )}
      </Form>
    );
  }
}

export default TrialsFilterForm;
