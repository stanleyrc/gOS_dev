import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Segmented, Skeleton } from "antd";
import PopulationPanel from "../../components/populationPanel";
import Wrapper from "./index.style";
import ErrorPanel from "../../components/errorPanel";
import { CgArrowsBreakeH } from "react-icons/cg";

class PopulationTab extends Component {
  state = {
    populationKPIMode: "total",
    signatureKPIMode: "total",
    signatureFractionMode: "count",
    signatureDistributionMode: "population",
    mutationFilter: "sbs",
  };

  handlePopulationKPIsSegmentedChange = (populationKPIMode) => {
    this.setState({ populationKPIMode });
  };

  render() {
    const {
      t,
      loading,
      metadata,
      plots,
      tumorPlots,
      error,
      missing,
    } = this.props;
    const { populationKPIMode } = this.state;

    if (missing) return null;

    return (
      <Wrapper>
        {error ? (
          <ErrorPanel
            avatar={<CgArrowsBreakeH />}
            header={t("containers.detail-view.tabs.tab3")}
            title={t("general.error", {
              error: t("containers.detail-view.tabs.tab3"),
            })}
            subtitle={error.toString()}
            explanationTitle={t("general.error", {
              error: t("containers.detail-view.tabs.tab3"),
            })}
            explanationDescription={error.stack || error.toString()}
          />
        ) : (
        <Skeleton active loading={loading}>
          <Segmented
            size="small"
            options={[
              {
                label: t("components.segmented-filter.total"),
                value: "total",
              },
              {
                label: t("components.segmented-filter.tumor", {
                  tumor: metadata.tumor_type,
                }),
                value: "byTumor",
              },
            ]}
            onChange={(d) => this.handlePopulationKPIsSegmentedChange(d)}
          />
          <PopulationPanel
            {...{
              loading,
              metadata,
              plots,
              visible: populationKPIMode === "total",
  
            }}
          />
          <PopulationPanel
            {...{
              loading,
              metadata,
              plots: tumorPlots,
              visible: populationKPIMode === "byTumor",
            }}
          />
        </Skeleton>
        )}
      </Wrapper>
    );
  }
}
PopulationTab.propTypes = {};
PopulationTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  loading: state.PopulationStatistics.loading,
  metadata: state.CaseReport.metadata,
  plots: state.PopulationStatistics.general,
  tumorPlots: state.PopulationStatistics.tumor,
  error: state.PopulationStatistics.error,
  missing: state.PopulationStatistics.missing,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(PopulationTab));
