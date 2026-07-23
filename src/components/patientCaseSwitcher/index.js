import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import axios from "axios";
import { Button, Dropdown, Tooltip, Typography } from "antd";
import { CheckOutlined, DownOutlined } from "@ant-design/icons";
import settingsActions from "../../redux/settings/actions";
import {
  findPatientCases,
  isSamePatientCase,
  normalizePatientId,
  patientCaseIdentityKey,
} from "./helpers";
import Wrapper, { PatientCaseMenuStyle } from "./index.style";

const { Text } = Typography;
const { updateCaseReport, updateDataset } = settingsActions;

const defaultSearchPatientCases = (datasets, patientId, config) =>
  findPatientCases(datasets, patientId, config);

const defaultCreateCancelSource = () => axios.CancelToken.source();

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
    this.activeCancelSource = null;
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
    this.cancelActiveRequest();
  }

  getPatientId = (props = this.props) =>
    normalizePatientId(props.metadata?.patient_id);

  getCurrentIdentity = (props = this.props) => ({
    datasetId: props.metadata?.datasetId ?? null,
    caseReportId: props.metadata?.caseReportId ?? null,
  });

  getDatasetSources = (props = this.props) =>
    (props.datasets || []).map((dataset) => [
      dataset?.id ?? null,
      dataset?.datafilesPath ?? null,
    ]);

  getRequestContextKey = (props) => {
    const identity = this.getCurrentIdentity(props);
    return JSON.stringify([
      this.getPatientId(props),
      identity.datasetId,
      identity.caseReportId,
      this.getDatasetSources(props),
    ]);
  };

  getDatasetTitle = (datasetId) =>
    this.props.datasets.find((dataset) => dataset.id === datasetId)?.title ||
    datasetId;

  getMenuItems = () => {
    const { t } = this.props;
    const { cases } = this.state;
    const currentIdentity = this.getCurrentIdentity();

    if (cases.length === 0) {
      return [
        {
          key: "patient-case-switcher-empty",
          disabled: true,
          label: t("components.patient-case-switcher.empty"),
        },
      ];
    }

    return cases.map((patientCase) => {
      const isCurrent = isSamePatientCase(
        patientCase.identity,
        currentIdentity
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
            <Text
              type="secondary"
              className="patient-case-switcher-option-context"
            >
              {this.getDatasetTitle(patientCase.identity.datasetId)}
            </Text>
            {patientCase.specimenDate ? (
              <Text
                type="secondary"
                className="patient-case-switcher-option-context"
              >
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

  isCurrentRequest = (requestId) =>
    this.isMountedForRequests && requestId === this.requestId;

  cancelActiveRequest = () => {
    if (this.activeCancelSource?.cancel) {
      this.activeCancelSource.cancel("Patient case request superseded");
    }
    this.activeCancelSource = null;
  };

  loadPatientCases = async () => {
    const patientId = this.getPatientId();
    const requestId = this.requestId + 1;
    this.requestId = requestId;
    this.cancelActiveRequest();

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

    const cancelSource = this.props.createCancelSource();
    this.activeCancelSource = cancelSource;
    this.setState({
      kind: "loading",
      cases: [],
      failedDatasetCount: 0,
      message: null,
    });

    try {
      const result = await this.props.searchPatientCases(
        this.props.datasets,
        patientId,
        { cancelToken: cancelSource.token }
      );
      if (!this.isCurrentRequest(requestId)) return;

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
      if (!this.isCurrentRequest(requestId) || axios.isCancel(error)) return;

      this.setState({
        kind: "failed",
        cases: [],
        failedDatasetCount: 0,
        message: error?.message || `${error}`,
      });
    } finally {
      if (this.activeCancelSource === cancelSource) {
        this.activeCancelSource = null;
      }
    }
  };

  handleCaseSelect = ({ key }) => {
    const patientCase = this.state.cases.find(
      ({ identity }) => patientCaseIdentityKey(identity) === key
    );
    const currentIdentity = this.getCurrentIdentity();
    if (
      !patientCase ||
      isSamePatientCase(patientCase.identity, currentIdentity)
    ) {
      return;
    }

    if (patientCase.identity.datasetId === currentIdentity.datasetId) {
      this.props.updateCaseReport(patientCase.identity.caseReportId);
      return;
    }

    const dataset = this.props.datasets.find(
      ({ id }) => id === patientCase.identity.datasetId
    );
    if (dataset) {
      this.props.updateDataset(dataset, patientCase.identity.caseReportId);
    }
  };

  renderControl = () => {
    const { t } = this.props;
    const { kind, cases } = this.state;

    if (kind === "loading") {
      return (
        <Button
          className="patient-case-switcher-trigger"
          size="small"
          loading
          disabled
        >
          {t("components.patient-case-switcher.loading")}
        </Button>
      );
    }

    if (kind === "failed") {
      return (
        <Tooltip
          title={t("components.patient-case-switcher.failure-description")}
        >
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

    if (kind !== "ready") return null;

    const currentKey = patientCaseIdentityKey(this.getCurrentIdentity());
    const dropdown = (
      <Dropdown
        menu={{
          items: this.getMenuItems(),
          onClick: this.handleCaseSelect,
          selectable: true,
          selectedKeys: [currentKey],
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
            { count: cases.length }
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
  createCancelSource: PropTypes.func,
  datasets: PropTypes.arrayOf(PropTypes.object),
  metadata: PropTypes.object,
  searchPatientCases: PropTypes.func,
  t: PropTypes.func.isRequired,
  updateCaseReport: PropTypes.func.isRequired,
  updateDataset: PropTypes.func.isRequired,
};

PatientCaseSwitcher.defaultProps = {
  createCancelSource: defaultCreateCancelSource,
  datasets: [],
  metadata: {},
  searchPatientCases: defaultSearchPatientCases,
};

const mapStateToProps = (state) => ({
  datasets: state.Datasets?.records || [],
  metadata: state.CaseReport?.metadata || {},
});

const mapDispatchToProps = (dispatch) => ({
  updateCaseReport: (caseReportId) =>
    dispatch(updateCaseReport(caseReportId)),
  updateDataset: (dataset, caseReportId) =>
    dispatch(updateDataset(dataset, caseReportId)),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(PatientCaseSwitcher));
