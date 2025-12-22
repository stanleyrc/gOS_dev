import React, { Component } from "react";
import { Modal, Space, Skeleton, Form, Row, Col, Select, Input, Tabs, Checkbox, Button, Collapse } from "antd";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import ctgovLogo from "../../assets/images/ctgov_logo.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import TrialsPlotView from "./trialsPlotView";
import TrialsTableView from "./trialsTableView";
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
    const { trials, cancerTypeFilter, biomarkerFilters, phaseFilter, statusFilter, lineOfTherapyFilter } = this.state;

    return trials.filter((trial) => {
      if (cancerTypeFilter && !(trial.cancer_types || []).includes(cancerTypeFilter)) {
        return false;
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

      return true;
    });
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
    });
  };

  render() {
    const { visible, onCancel, t } = this.props;
    const {
      isLoading,
      cancerTypeFilter,
      biomarkerInput,
      biomarkerFilters,
      phaseFilter,
      statusFilter,
      lineOfTherapyFilter,
      selectedOutcomeType,
      activeTab,
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
              <Col span={12} style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", paddingBottom: 4 }}>
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
        </Skeleton>
      </Modal>
    );
  }
}

const mapStateToProps = (state) => ({
  report: state.CaseReport.metadata,
});

export default connect(mapStateToProps)(withTranslation("common")(ClinicalTrialsModal));
