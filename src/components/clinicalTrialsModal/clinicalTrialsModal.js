import React, { Component } from "react";
import { Modal, Space, Skeleton, Tabs, Checkbox, Collapse } from "antd";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import ctgovLogo from "../../assets/images/ctgov_logo.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import TrialsPlotView from "./trialsPlotView";
import TrialsTableView from "./trialsTableView";
import TrialDetailsPanel from "./TrialDetailsPanel";
import TrialsFilterForm from "./trialsFilterForm";
import {
  getDefaultFilterState,
  getUniqueOptionsFromTrials,
} from "./constants";
import { filterTrials } from "./trialDataUtils";

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

  // Generic handler factory for simple setState operations
  createStateHandler = (stateKey) => (value) => {
    this.setState({ [stateKey]: value });
  };

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
    return getUniqueOptionsFromTrials(this.state.trials, (trial, set) => {
      (trial.cancer_types || []).forEach((ct) => set.add(ct));
    });
  };

  getTreatmentClassOptions = () => {
    return getUniqueOptionsFromTrials(this.state.trials, (trial, set) => {
      Object.values(trial.treatment_class_map || {}).forEach((tc) => set.add(tc));
    });
  };

  getCancerStageOptions = () => {
    return getUniqueOptionsFromTrials(this.state.trials, (trial, set) => {
      (trial.cancer_stages || []).forEach((s) => set.add(s));
    });
  };

  getFilteredTrials = () => {
    const { trials } = this.state;
    return filterTrials(trials, {
      cancerTypeFilter: this.state.cancerTypeFilter,
      biomarkerFilters: this.state.biomarkerFilters,
      phaseFilter: this.state.phaseFilter,
      statusFilter: this.state.statusFilter,
      lineOfTherapyFilter: this.state.lineOfTherapyFilter,
      nctIdFilters: this.state.nctIdFilters,
      treatmentClassFilter: this.state.treatmentClassFilter,
      cancerStageFilter: this.state.cancerStageFilter,
      priorTkiFilter: this.state.priorTkiFilter,
      priorIoFilter: this.state.priorIoFilter,
      priorPlatinumFilter: this.state.priorPlatinumFilter,
    });
  };

  handleCancerTypeChange = this.createStateHandler('cancerTypeFilter');

  handleBiomarkerChange = (inputValue) => {
    this.setState({ biomarkerInput: inputValue });
    const filters = inputValue
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    this.setState({ biomarkerFilters: filters });
  };

  handlePhaseChange = this.createStateHandler('phaseFilter');

  handleStatusChange = this.createStateHandler('statusFilter');

  handleLineOfTherapyChange = this.createStateHandler('lineOfTherapyFilter');

  handleOutcomeTypeChange = this.createStateHandler('selectedOutcomeType');

  handleNctIdChange = (inputValue) => {
    const filters = inputValue
      .split(",")
      .map((id) => id.trim().toUpperCase())
      .filter((id) => id.length > 0);
    this.setState({ nctIdInput: inputValue, nctIdFilters: filters });
  };

  handleTreatmentClassChange = this.createStateHandler('treatmentClassFilter');

  handleCancerStageChange = this.createStateHandler('cancerStageFilter');

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
      ...getDefaultFilterState(true, cancerType),
      selectedOutcomeType: "PFS",
      selectedTrial: null,
      selectedOutcome: null,
    });
  };

  handleClear = () => {
    this.setState(getDefaultFilterState());
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

    const { trials } = this.state;

    const tabItems = [
      {
        key: "plot",
        label: t("components.clinical-trials-modal.plot-tab") || "Plot",
        children: (
          <TrialsPlotView
            trials={filteredTrials}
            allTrials={trials}
            showSocAlways={showSocAlways}
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
          <TrialsFilterForm
            t={t}
            cancerTypeFilter={cancerTypeFilter}
            biomarkerInput={biomarkerInput}
            phaseFilter={phaseFilter}
            statusFilter={statusFilter}
            lineOfTherapyFilter={lineOfTherapyFilter}
            selectedOutcomeType={selectedOutcomeType}
            nctIdInput={nctIdInput}
            treatmentClassFilter={treatmentClassFilter}
            cancerStageFilter={cancerStageFilter}
            priorTkiFilter={priorTkiFilter}
            priorIoFilter={priorIoFilter}
            priorPlatinumFilter={priorPlatinumFilter}
            showSocAlways={showSocAlways}
            getCancerTypeOptions={this.getCancerTypeOptions}
            getTreatmentClassOptions={this.getTreatmentClassOptions}
            getCancerStageOptions={this.getCancerStageOptions}
            onCancerTypeChange={this.handleCancerTypeChange}
            onBiomarkerChange={this.handleBiomarkerChange}
            onPhaseChange={this.handlePhaseChange}
            onStatusChange={this.handleStatusChange}
            onLineOfTherapyChange={this.handleLineOfTherapyChange}
            onOutcomeTypeChange={this.handleOutcomeTypeChange}
            onNctIdChange={this.handleNctIdChange}
            onTreatmentClassChange={this.handleTreatmentClassChange}
            onCancerStageChange={this.handleCancerStageChange}
            onPriorTkiChange={(checked) => this.setState({ priorTkiFilter: checked })}
            onPriorIoChange={(checked) => this.setState({ priorIoFilter: checked })}
            onPriorPlatinumChange={(checked) => this.setState({ priorPlatinumFilter: checked })}
            onShowSocAlwaysChange={(checked) => this.setState({ showSocAlways: checked })}
            onClear={this.handleClear}
            onReset={this.handleReset}
          />

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
