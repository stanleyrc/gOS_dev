import React, { Component } from "react";
import { Modal, Space, Skeleton, Form, Row, Col, Select, Input, Tabs, Checkbox, Button, Collapse } from "antd";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import ctgovLogo from "../../assets/images/ctgov_logo.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import TrialsPlotView from "./trialsPlotView";
import TrialsTableView from "./trialsTableView";
import TrialDetailsPanel from "./TrialDetailsPanel";
import { PHASE_OPTIONS, STATUS_OPTIONS, LINE_OF_THERAPY_OPTIONS, OUTCOME_TYPES } from "./constants";

class ClinicalTrialsModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      trials: [],
      isLoading: false,
      cancerTypeFilter: "",
      biomarkerInput: "",
      biomarkerFilters: [],
      phaseFilter: null,
      statusFilter: null,
      lineOfTherapyFilter: null,
      selectedOutcomeType: "PFS",
      activeTab: "plot",
      // New filter states
      nctIdInput: "",
      nctIdFilters: [],
      treatmentClassFilter: null,
      cancerStageFilter: null,
      priorTkiFilter: false,
      priorIoFilter: false,
      priorPlatinumFilter: false,
      showSocAlways: false,
      // Trial details panel state
      selectedTrial: null,
      selectedOutcome: null,
    };
  }

  async componentDidMount() {
    this.setState({ isLoading: true });
    try {
      const response = await fetch(`${process.env.PUBLIC_URL}/all_extracted_trials.json`);
      const trials = await response.json();
      this.setState({ trials, isLoading: false });
    } catch (error) {
      console.error("Error loading trials:", error);
      this.setState({ isLoading: false });
    }
  }

  componentDidUpdate(prevProps) {
    const { report } = this.props;
    if (report !== prevProps.report && report) {
      const cancerType = report.tumor_details || report.disease || "";
      this.setState({ cancerTypeFilter: cancerType });
    }
  }

  getCancerTypeOptions = () => {
    const { trials } = this.state;
    const cancerTypes = new Set();
    trials.forEach((trial) => {
      (trial.cancer_types || []).forEach((ct) => cancerTypes.add(ct));
    });
    return Array.from(cancerTypes)
      .sort()
      .map((ct) => ({ label: ct, value: ct }));
  };

  getTreatmentClassOptions = () => {
    const { trials } = this.state;
    const classes = new Set();
    trials.forEach((trial) => {
      Object.values(trial.treatment_class_map || {}).forEach((tc) => classes.add(tc));
    });
    return Array.from(classes)
      .sort()
      .map((tc) => ({ label: tc, value: tc }));
  };

  getCancerStageOptions = () => {
    const { trials } = this.state;
    const stages = new Set();
    trials.forEach((trial) => {
      (trial.cancer_stages || []).forEach((s) => stages.add(s));
    });
    return Array.from(stages)
      .sort()
      .map((s) => ({ label: s, value: s }));
  };

  parseBiomarkerFilter = (filterStr) => {
    if (!filterStr || !filterStr.trim()) return [];
    return filterStr
      .split(",")
      .map((term) => term.trim())
      .filter((term) => term.length > 0)
      .map((term) => {
        if (term.endsWith("+")) {
          return { target: term.slice(0, -1).toUpperCase(), status: "POSITIVE" };
        } else if (term.endsWith("-")) {
          return { target: term.slice(0, -1).toUpperCase(), status: "NEGATIVE" };
        } else {
          return { target: term.toUpperCase(), status: null };
        }
      });
  };

  trialMatchesBiomarkerFilter = (trial, queries) => {
    if (queries.length === 0) return true;
    return queries.every((query) => {
      return trial.biomarkers?.some((b) => {
        const targetMatch = b.target.toUpperCase().includes(query.target);
        const detailsMatch = b.details && b.details.toUpperCase().includes(query.target);
        if (!targetMatch && !detailsMatch) return false;
        if (query.status) {
          const effectiveStatus = b.status === "HIGH" || b.status === "LOW" ? "POSITIVE" : b.status;
          return effectiveStatus === query.status;
        }
        return true;
      });
    });
  };

  getFilteredTrials = () => {
    const {
      trials,
      cancerTypeFilter,
      biomarkerFilters,
      phaseFilter,
      statusFilter,
      lineOfTherapyFilter,
      nctIdFilters,
      treatmentClassFilter,
      cancerStageFilter,
      priorTkiFilter,
      priorIoFilter,
      priorPlatinumFilter,
      showSocAlways,
    } = this.state;

    const socClasses = ["Chemo", "Placebo"];
    const socTrials = [];

    const filtered = trials.filter((trial) => {
      // NCT ID filter (OR logic)
      if (nctIdFilters.length > 0) {
        const matches = nctIdFilters.some((id) => trial.nct_id?.toUpperCase() === id);
        if (!matches) return false;
      }

      if (cancerTypeFilter && !(trial.cancer_types || []).includes(cancerTypeFilter)) {
        return false;
      }

      // Cancer Stage filter
      if (cancerStageFilter) {
        const hasMatch = (trial.cancer_stages || []).includes(cancerStageFilter);
        if (!hasMatch) return false;
      }

      if (biomarkerFilters.length > 0) {
        const queries = biomarkerFilters.map((bf) => {
          if (bf.endsWith("+")) {
            return { target: bf.slice(0, -1).toUpperCase(), status: "POSITIVE" };
          } else if (bf.endsWith("-")) {
            return { target: bf.slice(0, -1).toUpperCase(), status: "NEGATIVE" };
          } else {
            return { target: bf.toUpperCase(), status: null };
          }
        });
        if (!this.trialMatchesBiomarkerFilter(trial, queries)) {
          return false;
        }
      }

      if (phaseFilter && trial.phase !== phaseFilter) {
        return false;
      }

      if (statusFilter && trial.status !== statusFilter) {
        return false;
      }

      if (lineOfTherapyFilter && trial.line_of_therapy !== lineOfTherapyFilter) {
        return false;
      }

      // Treatment Class filter
      if (treatmentClassFilter) {
        const hasMatch = Object.values(trial.treatment_class_map || {}).includes(treatmentClassFilter);
        if (!hasMatch) return false;
      }

      // Eligibility criteria filters
      if (priorTkiFilter && trial.prior_tki !== true) return false;
      if (priorIoFilter && trial.prior_io !== true) return false;
      if (priorPlatinumFilter && trial.prior_platinum !== true) return false;

      return true;
    });

    // Always Show SoC: collect SoC trials separately when enabled
    if (showSocAlways) {
      trials.forEach((trial) => {
        // Skip ADJUVANT and NEOADJUVANT trials for SoC
        if (trial.line_of_therapy === "ADJUVANT" || trial.line_of_therapy === "NEOADJUVANT") {
          return;
        }
        const hasSocArm = Object.values(trial.treatment_class_map || {}).some((tc) => socClasses.includes(tc));
        if (hasSocArm && !filtered.includes(trial)) {
          socTrials.push(trial);
        }
      });
      return [...filtered, ...socTrials];
    }

    return filtered;
  };

  handleCancerTypeChange = (value) => {
    this.setState({ cancerTypeFilter: value });
  };

  handleBiomarkerChange = (inputValue) => {
    this.setState({ biomarkerInput: inputValue });
    const filters = inputValue
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    this.setState({ biomarkerFilters: filters });
  };

  handlePhaseChange = (value) => {
    this.setState({ phaseFilter: value });
  };

  handleStatusChange = (value) => {
    this.setState({ statusFilter: value });
  };

  handleLineOfTherapyChange = (value) => {
    this.setState({ lineOfTherapyFilter: value });
  };

  handleOutcomeTypeChange = (value) => {
    this.setState({ selectedOutcomeType: value });
  };

  handleNctIdChange = (inputValue) => {
    const filters = inputValue
      .split(",")
      .map((id) => id.trim().toUpperCase())
      .filter((id) => id.length > 0);
    this.setState({ nctIdInput: inputValue, nctIdFilters: filters });
  };

  handleTreatmentClassChange = (value) => {
    this.setState({ treatmentClassFilter: value });
  };

  handleCancerStageChange = (value) => {
    this.setState({ cancerStageFilter: value });
  };

  handleTrialClick = (trial, outcome = null) => {
    this.setState({ selectedTrial: trial, selectedOutcome: outcome });
  };

  handleCloseTrialDetails = () => {
    this.setState({ selectedTrial: null, selectedOutcome: null });
  };

  handleTabChange = (key) => {
    this.setState({ activeTab: key });
  };

  handleToggleEvent = (record, checked) => {
    const { biomarkerFilters } = this.state;
    const geneName = record.gene;
    if (!geneName) return;

    const biomarkerEntry = `${geneName}+`;

    if (checked) {
      if (!biomarkerFilters.includes(biomarkerEntry)) {
        this.setState({ biomarkerFilters: [...biomarkerFilters, biomarkerEntry] });
      }
    } else {
      this.setState({ biomarkerFilters: biomarkerFilters.filter((b) => b !== biomarkerEntry) });
    }
  };

  isEventSelected = (record) => {
    const { biomarkerFilters } = this.state;
    const geneName = record.gene;
    if (!geneName) return false;
    const biomarkerEntry = `${geneName}+`;
    return biomarkerFilters.includes(biomarkerEntry);
  };

  handleReset = () => {
    const { report } = this.props;
    const cancerType = report?.tumor_details || report?.disease || "";
    this.setState({
      cancerTypeFilter: cancerType,
      biomarkerInput: "",
      biomarkerFilters: [],
      phaseFilter: null,
      statusFilter: null,
      lineOfTherapyFilter: null,
      selectedOutcomeType: "PFS",
      nctIdInput: "",
      nctIdFilters: [],
      treatmentClassFilter: null,
      cancerStageFilter: null,
      priorTkiFilter: false,
      priorIoFilter: false,
      priorPlatinumFilter: false,
      showSocAlways: false,
      selectedTrial: null,
      selectedOutcome: null,
    });
  };

  handleClear = () => {
    this.setState({
      cancerTypeFilter: "",
      biomarkerInput: "",
      biomarkerFilters: [],
      phaseFilter: null,
      statusFilter: null,
      lineOfTherapyFilter: null,
      nctIdInput: "",
      nctIdFilters: [],
      treatmentClassFilter: null,
      cancerStageFilter: null,
      priorTkiFilter: false,
      priorIoFilter: false,
      priorPlatinumFilter: false,
      showSocAlways: false,
    });
  };

  render() {
    const { visible, onCancel, t } = this.props;
    const {
      isLoading,
      cancerTypeFilter,
      biomarkerInput,
      phaseFilter,
      statusFilter,
      lineOfTherapyFilter,
      selectedOutcomeType,
      activeTab,
      nctIdInput,
      treatmentClassFilter,
      cancerStageFilter,
      priorTkiFilter,
      priorIoFilter,
      priorPlatinumFilter,
      showSocAlways,
      selectedTrial,
      selectedOutcome,
    } = this.state;

    const filteredTrials = this.getFilteredTrials();

    const selectColumn = [
      {
        title: "",
        key: "select",
        width: 50,
        fixed: "left",
        align: "center",
        render: (_, record) => (
          <Checkbox
            checked={this.isEventSelected(record)}
            onChange={(e) => this.handleToggleEvent(record, e.target.checked)}
          />
        ),
      },
    ];

    const tabItems = [
      {
        key: "plot",
        label: t("components.clinical-trials-modal.plot-tab") || "Plot",
        children: (
          <TrialsPlotView
            trials={filteredTrials}
            outcomeType={selectedOutcomeType}
            onTrialClick={this.handleTrialClick}
          />
        ),
      },
      {
        key: "table",
        label: t("components.clinical-trials-modal.table-tab") || "Table",
        children: (
          <TrialsTableView
            trials={filteredTrials}
            outcomeType={selectedOutcomeType}
            onTrialClick={this.handleTrialClick}
          />
        ),
      },
    ];

    return (
      <Modal
        title={
          <Space>
            <img
              src={ctgovLogo}
              alt="ClinicalTrials.gov"
              style={{ height: "24px", width: "24px" }}
            />
            <span>{t("components.clinical-trials-modal.title") || "Clinical Trials"}</span>
          </Space>
        }
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={1600}
        style={{ maxHeight: "98vh" }}
        styles={{ body: { maxHeight: "calc(98vh - 120px)", overflowY: "auto" } }}
      >
        <Skeleton active loading={isLoading}>
          <Form layout="vertical" style={{ marginBottom: 24 }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item label={t("components.clinical-trials-modal.cancer-type") || "Cancer Type"}>
                  <Select
                    value={cancerTypeFilter || undefined}
                    options={this.getCancerTypeOptions()}
                    onChange={this.handleCancerTypeChange}
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
                     onChange={(e) => this.handleBiomarkerChange(e.target.value)}
                     placeholder="e.g., KRAS+, EGFR-, MET"
                   />
                 </Form.Item>
               </Col>
              <Col span={6}>
                <Form.Item label={t("components.clinical-trials-modal.line-of-therapy") || "Line of Therapy"}>
                  <Select
                    value={lineOfTherapyFilter}
                    options={LINE_OF_THERAPY_OPTIONS}
                    onChange={this.handleLineOfTherapyChange}
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
                    onChange={this.handlePhaseChange}
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
                    onChange={this.handleStatusChange}
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
                    onChange={this.handleOutcomeTypeChange}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="NCT ID">
                  <Input
                    value={nctIdInput}
                    onChange={(e) => this.handleNctIdChange(e.target.value)}
                    placeholder="e.g., NCT00003869, NCT01234567"
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Treatment Class">
                  <Select
                    value={treatmentClassFilter}
                    options={this.getTreatmentClassOptions()}
                    onChange={this.handleTreatmentClassChange}
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
                    options={this.getCancerStageOptions()}
                    onChange={this.handleCancerStageChange}
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
                    <Checkbox
                      checked={priorTkiFilter}
                      onChange={(e) => this.setState({ priorTkiFilter: e.target.checked })}
                    >
                      Prior TKI
                    </Checkbox>
                    <Checkbox
                      checked={priorIoFilter}
                      onChange={(e) => this.setState({ priorIoFilter: e.target.checked })}
                    >
                      Prior IO
                    </Checkbox>
                    <Checkbox
                      checked={priorPlatinumFilter}
                      onChange={(e) => this.setState({ priorPlatinumFilter: e.target.checked })}
                    >
                      Prior Platinum
                    </Checkbox>
                  </Space>
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Options">
                  <Checkbox
                    checked={showSocAlways}
                    onChange={(e) => this.setState({ showSocAlways: e.target.checked })}
                  >
                    Always Show SoC
                  </Checkbox>
                </Form.Item>
              </Col>
              <Col span={6} style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", paddingBottom: 4 }}>
                <Space>
                  <Button onClick={this.handleClear}>Clear</Button>
                  <Button onClick={this.handleReset}>Reset</Button>
                </Space>
              </Col>
            </Row>
          </Form>

          <Collapse
            style={{ marginBottom: 24 }}
            items={[
              {
                key: "events",
                label: "Related Genomic Events",
                children: (
                  <FilteredEventsListPanel additionalColumns={selectColumn} />
                ),
              },
            ]}
          />

          <Tabs
            activeKey={activeTab}
            onChange={this.handleTabChange}
            items={tabItems}
          />

          {selectedTrial && (
            <TrialDetailsPanel
              trial={selectedTrial}
              clickedOutcome={selectedOutcome}
              onClose={this.handleCloseTrialDetails}
            />
          )}
        </Skeleton>
      </Modal>
    );
  }
}

const mapStateToProps = (state) => ({
  report: state.CaseReport.metadata,
});

export default connect(mapStateToProps)(withTranslation("common")(ClinicalTrialsModal));
