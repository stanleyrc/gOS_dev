import React, { Component } from "react";
import { Modal, Space, Skeleton, Tabs, Checkbox, Collapse } from "antd";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import ctgovLogo from "../../assets/images/ctgov_logo.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import TrialsPlotView from "./trialsPlotView";
import TrialsTableView from "./trialsTableView";
import TrialDetailsPanel from "./TrialDetailsPanel";
import OutcomeHistogram from "./OutcomeHistogram";
import TrialsFilterForm from "./trialsFilterForm";
import {
  getDefaultFilterState,
  getUniqueOptionsFromTrials,
  getNctIdOptionsFromTrials,
} from "./constants";
import { filterTrials, hasAnyOutcomes, getAvailableOutcomeTypes } from "./trialDataUtils";

class ClinicalTrialsModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      trials: [],
      isLoading: false,
      cancerTypeFilters: [],
      biomarkerInput: "",
      biomarkerFilters: [],
      phaseFilters: [],
      statusFilter: null,
      lineOfTherapyFilter: null,
      xAxisType: "TIME",
      yAxisType: "PFS",
      activeTab: "plot",
      // New filter states
      nctIdFilters: [],
      sponsorFilters: [],
      drugFilters: [],
      treatmentClassFilters: [],
      cancerStageFilter: null,
      priorTkiFilter: false,
      priorIoFilter: false,
      priorPlatinumFilter: false,
      socDisplayMode: 'hide',
      biomarkerDetailsSearch: "",
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
      const validCancerType = this.getValidCancerTypeFromReport();
      this.setState({ cancerTypeFilters: validCancerType ? [validCancerType] : [] });
    }
  }

  getValidCancerTypeFromReport = () => {
    const { report } = this.props;
    const { trials } = this.state;
    const reportCancerType = report?.tumor_details || report?.disease || "";
    if (!reportCancerType || trials.length === 0) return null;

    // Get all valid cancer type codes from trials
    const validCodes = new Set();
    trials.forEach((trial) => {
      (trial.cancer_types || []).forEach((ct) => validCodes.add(ct));
    });

    // Only return if the report's cancer type matches a valid code
    return validCodes.has(reportCancerType) ? reportCancerType : null;
  };

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

  getNctIdOptions = () => {
    return getNctIdOptionsFromTrials(this.state.trials);
  };

  getSponsorOptions = () => {
    return getUniqueOptionsFromTrials(this.state.trials, (trial, set) => {
      if (trial.sponsor) set.add(trial.sponsor);
    });
  };

  getDrugOptions = () => {
    return getUniqueOptionsFromTrials(this.state.trials, (trial, set) => {
      Object.values(trial.arm_drugs || {}).forEach((drugs) => {
        (Array.isArray(drugs) ? drugs : [drugs]).forEach((drug) => {
          if (drug) set.add(drug);
        });
      });
    });
  };

  getFilteredTrials = () => {
    const { trials } = this.state;
    return filterTrials(trials, {
      cancerTypeFilters: this.state.cancerTypeFilters,
      biomarkerFilters: this.state.biomarkerFilters,
      biomarkerDetailsSearch: this.state.biomarkerDetailsSearch,
      phaseFilters: this.state.phaseFilters,
      statusFilter: this.state.statusFilter,
      lineOfTherapyFilter: this.state.lineOfTherapyFilter,
      nctIdFilters: this.state.nctIdFilters,
      sponsorFilters: this.state.sponsorFilters,
      drugFilters: this.state.drugFilters,
      treatmentClassFilters: this.state.treatmentClassFilters,
      cancerStageFilter: this.state.cancerStageFilter,
      priorTkiFilter: this.state.priorTkiFilter,
      priorIoFilter: this.state.priorIoFilter,
      priorPlatinumFilter: this.state.priorPlatinumFilter,
    });
  };

  handleCancerTypeChange = this.createStateHandler('cancerTypeFilters');

  handleBiomarkerChange = (inputValue) => {
    this.setState({ biomarkerInput: inputValue });
    const filters = inputValue
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    this.setState({ biomarkerFilters: filters });
  };

  handlePhaseChange = this.createStateHandler('phaseFilters');

  handleStatusChange = this.createStateHandler('statusFilter');

  handleLineOfTherapyChange = this.createStateHandler('lineOfTherapyFilter');

  handleOutcomeTypeChange = this.createStateHandler('selectedOutcomeType');

  handleXAxisChange = (value) => {
    const { yAxisType } = this.state;
    if (value === yAxisType) {
      // Swap axes
      this.setState({ xAxisType: value, yAxisType: this.state.xAxisType });
    } else {
      this.setState({ xAxisType: value });
    }
  };

  handleYAxisChange = (value) => {
    const { xAxisType } = this.state;
    if (value === xAxisType) {
      // Swap axes
      this.setState({ yAxisType: value, xAxisType: this.state.yAxisType });
    } else {
      this.setState({ yAxisType: value });
    }
  };

  handleNctIdChange = this.createStateHandler('nctIdFilters');

  handleSponsorChange = this.createStateHandler('sponsorFilters');

  handleDrugChange = this.createStateHandler('drugFilters');

  handleTreatmentClassChange = this.createStateHandler('treatmentClassFilters');

  handleCancerStageChange = this.createStateHandler('cancerStageFilter');

  handleBiomarkerDetailsSearchChange = this.createStateHandler('biomarkerDetailsSearch');

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

    let newFilters;
    if (checked) {
      if (!biomarkerFilters.includes(biomarkerEntry)) {
        newFilters = [...biomarkerFilters, biomarkerEntry];
      } else {
        return;
      }
    } else {
      newFilters = biomarkerFilters.filter((b) => b !== biomarkerEntry);
    }
    this.setState({
      biomarkerFilters: newFilters,
      biomarkerInput: newFilters.join(", "),
    });
  };

  isEventSelected = (record) => {
    const { biomarkerFilters } = this.state;
    const geneName = record.gene;
    if (!geneName) return false;
    const biomarkerEntry = `${geneName}+`;
    return biomarkerFilters.includes(biomarkerEntry);
  };

  handleReset = () => {
    const validCancerType = this.getValidCancerTypeFromReport();
    this.setState({
      ...getDefaultFilterState(true, validCancerType || ""),
      xAxisType: "TIME",
      yAxisType: "PFS",
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
      cancerTypeFilters,
      biomarkerInput,
      phaseFilters,
      statusFilter,
      lineOfTherapyFilter,
      xAxisType,
      yAxisType,
      activeTab,
      nctIdFilters,
      sponsorFilters,
      drugFilters,
      treatmentClassFilters,
      cancerStageFilter,
      priorTkiFilter,
      priorIoFilter,
      priorPlatinumFilter,
      socDisplayMode,
      biomarkerDetailsSearch,
      selectedTrial,
      selectedOutcome,
    } = this.state;

    const filteredTrials = this.getFilteredTrials();
    const availableOutcomes = getAvailableOutcomeTypes(filteredTrials);

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
        label: t("components.clinical-trials-modal.scatterplot-tab") || "Scatterplot",
        children: (
          <TrialsPlotView
            trials={filteredTrials}
            allTrials={trials}
            socDisplayMode={socDisplayMode}
            cancerTypeFilters={cancerTypeFilters}
            xAxisType={xAxisType}
            yAxisType={yAxisType}
            availableOutcomes={availableOutcomes}
            onXAxisChange={this.handleXAxisChange}
            onYAxisChange={this.handleYAxisChange}
            onTrialClick={this.handleTrialClick}
          />
        ),
      },
      {
        key: "histogram",
        label: t("components.clinical-trials-modal.histogram-tab") || "Distribution",
        children: (
          <OutcomeHistogram
            trials={filteredTrials}
            availableOutcomes={availableOutcomes}
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
            outcomeType={yAxisType}
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
        style={{ top: 20, maxHeight: "98vh" }}
        styles={{ body: { maxHeight: "calc(98vh - 120px)", overflowY: "auto", overflowX: "hidden" } }}
      >
        <Skeleton active loading={isLoading}>
          <TrialsFilterForm
            t={t}
            cancerTypeFilters={cancerTypeFilters}
            biomarkerInput={biomarkerInput}
            biomarkerDetailsSearch={biomarkerDetailsSearch}
            phaseFilters={phaseFilters}
            statusFilter={statusFilter}
            lineOfTherapyFilter={lineOfTherapyFilter}
            nctIdFilters={nctIdFilters}
            sponsorFilters={sponsorFilters}
            drugFilters={drugFilters}
            treatmentClassFilters={treatmentClassFilters}
            cancerStageFilter={cancerStageFilter}
            priorTkiFilter={priorTkiFilter}
            priorIoFilter={priorIoFilter}
            priorPlatinumFilter={priorPlatinumFilter}
            socDisplayMode={socDisplayMode}
            getCancerTypeOptions={this.getCancerTypeOptions}
            getTreatmentClassOptions={this.getTreatmentClassOptions}
            getCancerStageOptions={this.getCancerStageOptions}
            getNctIdOptions={this.getNctIdOptions}
            getSponsorOptions={this.getSponsorOptions}
            getDrugOptions={this.getDrugOptions}
            onCancerTypeChange={this.handleCancerTypeChange}
            onBiomarkerChange={this.handleBiomarkerChange}
            onBiomarkerDetailsSearchChange={this.handleBiomarkerDetailsSearchChange}
            onPhaseChange={this.handlePhaseChange}
            onStatusChange={this.handleStatusChange}
            onLineOfTherapyChange={this.handleLineOfTherapyChange}
            onNctIdChange={this.handleNctIdChange}
            onSponsorChange={this.handleSponsorChange}
            onDrugChange={this.handleDrugChange}
            onTreatmentClassChange={this.handleTreatmentClassChange}
            onCancerStageChange={this.handleCancerStageChange}
            onPriorTkiChange={(checked) => this.setState({ priorTkiFilter: checked })}
            onPriorIoChange={(checked) => this.setState({ priorIoFilter: checked })}
            onPriorPlatinumChange={(checked) => this.setState({ priorPlatinumFilter: checked })}
            onSocDisplayModeChange={(value) => this.setState({ socDisplayMode: value })}
            onClear={this.handleClear}
            onReset={this.handleReset}
            hasResults={hasAnyOutcomes(filteredTrials)}
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
