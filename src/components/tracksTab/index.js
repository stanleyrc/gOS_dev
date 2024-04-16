import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col } from "antd";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";
import TracksModal from "../tracksModal";

const {} = appActions;

class TracksTab extends Component {
  render() {
    const {
      t,
      loading,
      genome,
      mutations,
      chromoBins,
      coverageData,
      hetsnpsData,
      genesData,
      allelicData,
      updateSelectedFilteredEvent,
    } = this.props;
    return (
      <Wrapper>
        <TracksModal
          {...{
            loading,
            genomeData: genome,
            mutationsData: mutations,
            coverageData,
            hetsnpsData,
            genesData,
            chromoBins,
            allelicData,
            modalTitle: "",
            genomePlotTitle: t("components.tracks-modal.genome-plot"),
            genomePlotYAxisTitle: t(
              "components.tracks-modal.genome-y-axis-title"
            ),
            coveragePlotTitle: t("components.tracks-modal.coverage-plot"),
            coverageYAxisTitle: t(
              "components.tracks-modal.coverage-y-axis-title"
            ),
            coverageYAxis2Title: t(
              "components.tracks-modal.coverage-y-axis2-title"
            ),
            hetsnpPlotTitle: t("components.tracks-modal.hetsnp-plot"),
            hetsnpPlotYAxisTitle: t(
              "components.tracks-modal.hetsnp-plot-y-axis-title"
            ),
            mutationsPlotTitle: t("components.tracks-modal.mutations-plot"),
            mutationsPlotYAxisTitle: t(
              "components.tracks-modal.mutations-plot-y-axis-title"
            ),
            allelicPlotTitle: t("components.tracks-modal.allelic-plot"),
            allelicPlotYAxisTitle: t(
              "components.tracks-modal.allelic-plot-y-axis-title"
            ),
            handleOkClicked: () => updateSelectedFilteredEvent(null),
            handleCancelClicked: () => updateSelectedFilteredEvent(null),
            open: true,
            viewType: "inline",
          }}
        />
      </Wrapper>
    );
  }
}
TracksTab.propTypes = {};
TracksTab.defaultProps = {
  plots: [],
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  report: state.App.report,
  filteredEvents: state.App.filteredEvents,
  selectedFilteredEvent: state.App.selectedFilteredEvent,
  loading: state.App.loading,
  genome: state.App.genome,
  mutations: state.App.mutations,
  allelicData: state.App.allelic,
  chromoBins: state.App.chromoBins,
  coverageData: state.App.coverageData,
  hetsnpsData: state.App.hetsnpsData,
  genesData: state.App.genesData,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(TracksTab));
