import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col } from "antd";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";
import ViolinPlotPanel from "../violinPlotPanel";

const {} = appActions;

class SummaryTab extends Component {
  render() {
    const { t, metadata, plots, tumorPlots } = this.props;
    return (
      <Wrapper>
        <Row
          key={0}
          id={`row-${0}}`}
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={12}>
            {
              <ViolinPlotPanel
                {...{
                  title: t("components.violin-panel.header.total"),
                  plots: plots,
                  markers: metadata,
                }}
              />
            }
          </Col>
          <Col className="gutter-row" span={12}>
            {
              <ViolinPlotPanel
                {...{
                  title: t("components.violin-panel.header.tumor", {
                    tumor: metadata.tumor,
                  }),
                  plots: tumorPlots,
                  markers: metadata,
                }}
              />
            }
          </Col>
        </Row>
      </Wrapper>
    );
  }
}
SummaryTab.propTypes = {};
SummaryTab.defaultProps = {
  plots: [],
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  metadata: state.App.metadata,
  plots: state.App.populationMetrics,
  tumorPlots: state.App.tumorPopulationMetrics,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(SummaryTab));
