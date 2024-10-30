import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import Wrapper from "./index.style";
import TracksModal from "../../components/tracksModal";

class TracksTab extends Component {
  render() {
    const {
      t,
      loading,
      genomeLoading,
      genome,
      mutationsLoading,
      mutations,
      chromoBins,
      coverageDataLoading,
      coverageData,
      hetsnpsDataLoading,
      hetsnpsData,
      genesDataLoading,
      genesData,
      allelicDataLoading,
      allelicData,
      updateSelectedFilteredEvent,
    } = this.props;

    return (
      <Wrapper>
        <TracksModal
          {...{
            loading,
            genomeDataLoading: genomeLoading,
            genomeData: genome,
            mutationsDataLoading: mutationsLoading,
            mutationsData: mutations,
            coverageDataLoading,
            coverageData,
            hetsnpsDataLoading,
            hetsnpsData,
            genesDataLoading,
            genesData,
            chromoBins,
            allelicDataLoading,
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
            hetsnpPlotYAxis2Title: t(
              "components.tracks-modal.hetsnp-plot-y-axis2-title"
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
TracksTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  loading: state.Genome.loading,
  genomeLoading: state.Genome.loading,
  genome: state.Genome.data,
  mutationsLoading: state.Mutations.loading,
  mutations: state.Mutations.data,
  allelicDataLoading: state.Allelic.loading,
  allelicData: state.Allelic.data,
  chromoBins: state.Settings.chromoBins,
  coverageDataLoading: state.GenomeCoverage.loading,
  coverageData: state.GenomeCoverage.data,
  hetsnpsDataLoading: state.Hetsnps.loading,
  hetsnpsData: state.Hetsnps.data,
  genesDataLoading: state.Genes.loading,
  genesData: state.Genes.data,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(TracksTab));
