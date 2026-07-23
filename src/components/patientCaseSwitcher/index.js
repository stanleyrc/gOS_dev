import React, { Component } from "react";
import PropTypes from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Button, Dropdown, Tooltip, Typography } from "antd";
import { CheckOutlined, DownOutlined } from "@ant-design/icons";
import datasetsActions from "../../redux/datasets/actions";
import { loadConfiguredManifestsWithStatus } from "../../helpers/staticManifests";
import {
  findPatientCases,
  isSamePatientCase,
  normalizePatientId,
  patientCaseIdentityKey,
} from "./helpers";
import Wrapper, { PatientCaseMenuStyle } from "./index.style";

const { Text } = Typography;
const { openCaseReport } = datasetsActions;
const patientCaseSearchCache = new Map();
const MAX_PATIENT_SEARCH_CACHE_ENTRIES = 20;

const defaultLoadPatientCases = async (
  datasets,
  patientId,
  cachedRecordsByDataset,
) => {
  const cacheKey = JSON.stringify([
    patientId,
    (datasets || []).map((dataset) => [
      dataset?.id ?? null,
      dataset?.datafilesPath ?? null,
    ]),
  ]);
  if (patientCaseSearchCache.has(cacheKey)) {
    return patientCaseSearchCache.get(cacheKey);
  }

  const { recordsByDataset, failedDatasetCount } =
    await loadConfiguredManifestsWithStatus(
      datasets,
      cachedRecordsByDataset,
    );
  const result = {
    cases: findPatientCases(
      Object.values(recordsByDataset).flat(),
      patientId,
    ),
    failedDatasetCount,
  };
  if (failedDatasetCount === 0) {
    if (patientCaseSearchCache.size >= MAX_PATIENT_SEARCH_CACHE_ENTRIES) {
      patientCaseSearchCache.delete(patientCaseSearchCache.keys().next().value);
    }
    patientCaseSearchCache.set(cacheKey, result);
  }
  return result;
};

export class PatientCaseSwitcher extends Component {
  constructor(props) {
    super(props);
    this.state = {
      kind: "hidden",
      cases: [],
      failedDatasetCount: 0,
      message: null,
    };
    this.isMountedForRequests = false;
    this.requestId = 0;
  }

  componentDidMount() {
    this.isMountedForRequests = true;
    return this.loadPatientCases();
  }

  componentDidUpdate(previousProps) {
    if (
      this.getRequestContextKey(previousProps) !==
      this.getRequestContextKey(this.props)
    ) {
      return this.loadPatientCases();
    }
    return undefined;
  }

  componentWillUnmount() {
    this.isMountedForRequests = false;
    this.requestId += 1;
  }

  getPatientId = (props = this.props) =>
    normalizePatientId(props.metadata?.patient_id);

  getCurrentIdentity = (props = this.props) => ({
    datasetId: props.metadata?.datasetId ?? props.dataset?.id ?? null,
    caseReportId: props.metadata?.caseReportId ?? props.report ?? null,
  });

  getRequestContextKey = (props) => {
    const identity = this.getCurrentIdentity(props);
    const datasetSources = (props.datasets || []).map((dataset) => [
      dataset?.id ?? null,
      dataset?.datafilesPath ?? null,
    ]);
    return JSON.stringify([
      this.getPatientId(props),
      identity.datasetId,
      identity.caseReportId,
      datasetSources,
    ]);
  };

  getDatasetTitle = (datasetId) =>
    this.props.datasets.find((dataset) => `${dataset.id}` === `${datasetId}`)
      ?.title || datasetId;

  getMenuItems = () => {
    const { t } = this.props;
    const currentIdentity = this.getCurrentIdentity();

    if (this.state.cases.length === 0) {
      return [
        {
          key: "patient-case-switcher-empty",
          disabled: true,
          label: t("components.patient-case-switcher.empty"),
        },
      ];
    }

    return this.state.cases.map((patientCase) => {
      const isCurrent = isSamePatientCase(
        patientCase.identity,
        currentIdentity,
      );
      return {
        key: patientCaseIdentityKey(patientCase.identity),
        disabled: isCurrent,
        className: isCurrent ? "patient-case-switcher-current" : undefined,
        icon: isCurrent ? <CheckOutlined /> : null,
        label: (
          <div className="patient-case-switcher-option">
            <div className="patient-case-switcher-option-heading">
              <Text strong className="patient-case-switcher-option-pair">
                {patientCase.pair}
              </Text>
              {isCurrent ? (
                <Text type="secondary">
                  {t("components.patient-case-switcher.current")}
                </Text>
              ) : null}
            </div>
            <Text type="secondary" className="patient-case-switcher-option-context">
              {this.getDatasetTitle(patientCase.identity.datasetId)}
            </Text>
            {patientCase.specimenDate ? (
              <Text type="secondary" className="patient-case-switcher-option-context">
                {t("components.patient-case-switcher.specimen-date", {
                  date: patientCase.specimenDate,
                })}
              </Text>
            ) : null}
          </div>
        ),
      };
    });
  };

  loadPatientCases = async () => {
    const patientId = this.getPatientId();
    const requestId = this.requestId + 1;
    this.requestId = requestId;

    if (!patientId) {
      if (this.isMountedForRequests) {
        this.setState({
          kind: "hidden",
          cases: [],
          failedDatasetCount: 0,
          message: null,
        });
      }
      return;
    }

    this.setState({
      kind: "loading",
      cases: [],
      failedDatasetCount: 0,
      message: null,
    });
    try {
      const result = await this.props.loadPatientCases(
        this.props.datasets,
        patientId,
        this.props.cachedRecordsByDataset,
      );
      if (!this.isMountedForRequests || requestId !== this.requestId) return;
      this.setState({
        kind: "ready",
        cases: Array.isArray(result)
          ? result
          : Array.isArray(result?.cases)
            ? result.cases
            : [],
        failedDatasetCount: Number(result?.failedDatasetCount) || 0,
        message: null,
      });
    } catch (error) {
      if (!this.isMountedForRequests || requestId !== this.requestId) return;
      this.setState({
        kind: "failed",
        cases: [],
        failedDatasetCount: 0,
        message: error?.message || `${error}`,
      });
    }
  };

  handleCaseSelect = ({ key }) => {
    const patientCase = this.state.cases.find(
      ({ identity }) => patientCaseIdentityKey(identity) === key,
    );
    if (
      !patientCase ||
      isSamePatientCase(patientCase.identity, this.getCurrentIdentity())
    ) {
      return;
    }

    this.props.openCaseReport(
      patientCase.identity.datasetId,
      patientCase.identity.caseReportId,
    );
  };

  renderControl = () => {
    const { t } = this.props;
    if (this.state.kind === "loading") {
      return (
        <Button className="patient-case-switcher-trigger" size="small" loading disabled>
          {t("components.patient-case-switcher.loading")}
        </Button>
      );
    }
    if (this.state.kind === "failed") {
      return (
        <Tooltip title={t("components.patient-case-switcher.failure-description")}>
          <Button
            className="patient-case-switcher-trigger"
            size="small"
            onClick={this.loadPatientCases}
          >
            {t("components.patient-case-switcher.failure")}
          </Button>
        </Tooltip>
      );
    }
    if (this.state.kind !== "ready") return null;

    const dropdown = (
      <Dropdown
        menu={{
          items: this.getMenuItems(),
          onClick: this.handleCaseSelect,
          selectable: true,
          selectedKeys: [patientCaseIdentityKey(this.getCurrentIdentity())],
        }}
        overlayClassName="patient-case-switcher-menu"
        placement="bottomLeft"
        trigger={["click"]}
      >
        <Button className="patient-case-switcher-trigger" size="small">
          {t(
            this.state.failedDatasetCount > 0
              ? "components.patient-case-switcher.trigger-partial"
              : "components.patient-case-switcher.trigger",
            { count: this.state.cases.length },
          )}
          <DownOutlined />
        </Button>
      </Dropdown>
    );

    return this.state.failedDatasetCount > 0 ? (
      <Tooltip
        title={t("components.patient-case-switcher.partial-description", {
          count: this.state.failedDatasetCount,
        })}
      >
        {dropdown}
      </Tooltip>
    ) : (
      dropdown
    );
  };

  render() {
    if (!this.getPatientId()) return null;
    const control = this.renderControl();
    if (!control) return null;

    return (
      <>
        <PatientCaseMenuStyle />
        <Wrapper>{control}</Wrapper>
      </>
    );
  }
}

PatientCaseSwitcher.propTypes = {
  cachedRecordsByDataset: PropTypes.object,
  dataset: PropTypes.object,
  datasets: PropTypes.arrayOf(PropTypes.object),
  loadPatientCases: PropTypes.func,
  metadata: PropTypes.object,
  openCaseReport: PropTypes.func.isRequired,
  report: PropTypes.string,
  t: PropTypes.func.isRequired,
};

PatientCaseSwitcher.defaultProps = {
  cachedRecordsByDataset: {},
  dataset: null,
  datasets: [],
  loadPatientCases: defaultLoadPatientCases,
  metadata: {},
  report: null,
};

const mapStateToProps = (state) => ({
  cachedRecordsByDataset: state.CaseReports.manifestRecordsByDataset,
  dataset: state.Settings.dataset,
  datasets: state.Datasets.records,
  metadata: state.CaseReport.metadata,
  report: state.Settings.report,
});

const mapDispatchToProps = (dispatch) => ({
  openCaseReport: (datasetId, caseReportId) =>
    dispatch(openCaseReport(datasetId, caseReportId)),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(withTranslation("common")(PatientCaseSwitcher));
