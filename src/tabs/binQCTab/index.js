import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import { Row, Col, Image } from "antd";
import Wrapper from "./index.style";
import BinPlotPanel from "../../components/binPlotPanel";
import SnvplicityPlotPanel from "../../components/snvplicityPlotPanel";
import ErrorPanel from "../../components/errorPanel";
import { CgArrowsBreakeH } from "react-icons/cg";

class BinQcTab extends Component {
  state = {
    imageRenderError: null,
    purpleSunriseRenderError: null,
    hetsnpsImageRenderError: null,
  };

  componentDidUpdate(prevProps) {
    if (prevProps.id !== this.props.id) {
      this.setState({
        imageRenderError: null,
        purpleSunriseRenderError: null,
        hetsnpsImageRenderError: null,
      });
    }
  }

  renderAssetError = (filename, error) => {
    const { t } = this.props;
    return (
      <ErrorPanel
        avatar={<CgArrowsBreakeH />}
        header={filename}
        title={t("general.error", { error: filename })}
        subtitle={error.toString()}
        explanationTitle={t("general.error", { error: filename })}
        explanationDescription={error.stack || error.toString()}
      />
    );
  };

  render() {
    const {
      dataset,
      id,
      imagePresent,
      imageFile,
      imageError,
      snvplicityMissing,
      purpleSunrisePresent,
      purpleSunriseError,
      hetsnpsImagePresent,
      hetsnpsImageError,
    } = this.props;
    const multiplicityError = imageError || this.state.imageRenderError;
    const purpleError =
      purpleSunriseError || this.state.purpleSunriseRenderError;
    const hetsnpsError =
      hetsnpsImageError || this.state.hetsnpsImageRenderError;
    const showSnvplicity =
      imagePresent || multiplicityError || !snvplicityMissing;
    const showStaticImages =
      purpleSunrisePresent ||
      purpleError ||
      hetsnpsImagePresent ||
      hetsnpsError;

    return (
      <Wrapper>
        <Row
          className="ant-panel-container ant-home-plot-container"
          gutter={16}
        >
          <Col className="gutter-row" span={24}>
            <BinPlotPanel />
          </Col>
        </Row>
        {showSnvplicity && (
          <Row
            className="ant-panel-container ant-home-plot-container"
            gutter={16}
          >
            <Col className="gutter-row" span={24}>
              {multiplicityError ? (
                this.renderAssetError(imageFile, multiplicityError)
              ) : imagePresent && imageFile ? (
                <Image
                  src={`${dataset.dataPath}${id}/${imageFile}`}
                  preview={false}
                  onError={() =>
                    this.setState({
                      imageRenderError: new Error(`Failed to load ${imageFile}`),
                    })
                  }
                />
              ) : (
                <SnvplicityPlotPanel />
              )}
            </Col>
          </Row>
        )}
        {showStaticImages && (
          <Row
            className="ant-panel-container ant-home-plot-container"
            gutter={16}
          >
            {(purpleSunrisePresent || purpleError) && (
              <Col className="gutter-row" span={12}>
                {purpleError ? (
                  this.renderAssetError("purple_sunrise_pp.png", purpleError)
                ) : (
                  <Image
                    src={`${dataset.dataPath}${id}/purple_sunrise_pp.png`}
                    preview={false}
                    onError={() =>
                      this.setState({
                        purpleSunriseRenderError: new Error(
                          "Failed to load purple_sunrise_pp.png"
                        ),
                      })
                    }
                  />
                )}
              </Col>
            )}
            {(hetsnpsImagePresent || hetsnpsError) && (
              <Col className="gutter-row" span={12}>
                {hetsnpsError ? (
                  this.renderAssetError("hetsnps_major_minor.png", hetsnpsError)
                ) : (
                  <Image
                    src={`${dataset.dataPath}${id}/hetsnps_major_minor.png`}
                    preview={false}
                    onError={() =>
                      this.setState({
                        hetsnpsImageRenderError: new Error(
                          "Failed to load hetsnps_major_minor.png"
                        ),
                      })
                    }
                  />
                )}
              </Col>
            )}
          </Row>
        )}
      </Wrapper>
    );
  }
}
BinQcTab.propTypes = {};
BinQcTab.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  metadata: state.CaseReport.metadata,
  dataset: state.Settings.dataset,
  imagePresent: state.Snvplicity.imagePresent,
  imageFile: state.Snvplicity.imageFile,
  imageError: state.Snvplicity.imageError,
  snvplicityMissing: state.Snvplicity.missing,
  purpleSunrisePresent: state.Snvplicity.purpleSunrisePresent,
  purpleSunriseError: state.Snvplicity.purpleSunriseError,
  hetsnpsImagePresent: state.Snvplicity.hetsnpsImagePresent,
  hetsnpsImageError: state.Snvplicity.hetsnpsImageError,
  id: state.CaseReport.id,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(BinQcTab));
