import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Alert, Button, Select } from "antd";
import EventInterpretation from "../../helpers/EventInterpretation";
import { ensureUser } from "../../helpers/userAuth";
import {
  getPrimarySite,
  PRIMARY_SITE_ID,
  resolvePrimarySiteOptions,
} from "../../helpers/primarySite";
import interpretationsActions from "../../redux/interpretations/actions";
import { areCaseInterpretationsReady } from "../../redux/interpretations/selectors";
import Wrapper from "./index.style";

export class PrimarySiteSelect extends Component {
  state = { saving: false, error: null };
  operation = null;
  unmounted = false;

  componentDidUpdate(previous) {
    if (previous.caseId !== this.props.caseId || previous.dataset !== this.props.dataset) {
      this.operation = null;
      this.setState({ saving: false, error: null });
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
    this.operation = null;
  }

  handleChange = async (value) => {
    const { caseId, dataset, options, ready, savePrimarySite, t } = this.props;
    const option = options.find((candidate) => candidate.value === value);
    if (!ready || this.operation || !option || value === this.props.value?.value) return;

    const operation = {};
    this.operation = operation;
    const isActive = () => !this.unmounted && this.operation === operation &&
      this.props.caseId === caseId && this.props.dataset === dataset;
    this.setState({ saving: true, error: null });
    let signedIn = false;
    try {
      await ensureUser();
      signedIn = true;
      if (!isActive()) return;
      const interpretation = new EventInterpretation({
        caseId,
        datasetId: dataset.id,
        alterationId: PRIMARY_SITE_ID,
        data: { primarySite: { value: option.value, label: option.label } },
      });
      await savePrimarySite(interpretation.toJSON());
    } catch (error) {
      if (isActive() && signedIn) {
        this.setState({ error: t("components.primary-site.save-error") });
      }
    } finally {
      if (isActive()) {
        this.operation = null;
        this.setState({ saving: false });
      }
    }
  };

  render() {
    const { value, options, ready, loadError, retry, caseId, t } = this.props;
    const choices = options.map((option) => {
      const label = option.value === value?.value ? value.label : option.label;
      return {
        ...option,
        label: option.value === label ? label : `${option.value} — ${label}`,
        headerLabel: label,
      };
    });
    if (value && !choices.some((option) => option.value === value.value)) {
      choices.push({ ...value, headerLabel: value.label, disabled: true });
    }
    return (
      <Wrapper className="primary-site-select">
        <Select
          aria-label={t("components.primary-site.label")}
          title={`${t("components.primary-site.label")}: ${value?.label || "NA"}`}
          placeholder={t("components.primary-site.label")}
          showSearch
          optionFilterProp="label"
          optionLabelProp="headerLabel"
          bordered={false}
          dropdownMatchSelectWidth={false}
          dropdownStyle={{ width: 360, maxWidth: "calc(100vw - 32px)" }}
          value={value?.value}
          options={choices}
          onChange={this.handleChange}
          disabled={!ready || this.state.saving || options.length === 0}
          loading={this.state.saving}
        />
        <span className="primary-site-label-width" aria-hidden={true}>
          {value?.label || t("components.primary-site.label")}
        </span>
        {(this.state.error || loadError) && (
          <Alert
            type="error"
            showIcon
            message={this.state.error || t("components.primary-site.load-error")}
            action={loadError ? (
              <Button size="small" onClick={() => retry(caseId)}>
                {t("components.primary-site.retry")}
              </Button>
            ) : null}
          />
        )}
      </Wrapper>
    );
  }
}

export const mapStateToProps = (state) => {
  const ready = areCaseInterpretationsReady(state);
  return {
    caseId: state.CaseReport?.id,
    dataset: state.Settings?.dataset,
    value: getPrimarySite(state),
    options: resolvePrimarySiteOptions(state.Settings?.dataset, state.Settings?.data),
    ready,
    loadError: !ready && Boolean(state.Interpretations?.loadError),
  };
};

export const mapDispatchToProps = (dispatch) => ({
  savePrimarySite: (interpretation) => new Promise((resolve, reject) => {
    dispatch(interpretationsActions.updateInterpretation(interpretation, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    }));
  }),
  retry: (caseId) => dispatch(interpretationsActions.fetchInterpretationsForCase(caseId)),
});

export default connect(mapStateToProps, mapDispatchToProps)(
  withTranslation("common")(PrimarySiteSelect),
);
