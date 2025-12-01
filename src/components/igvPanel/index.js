import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import handleViewport from "react-in-viewport";
import { Card, Space, Tooltip, Button, message, Row, Col } from "antd";
import { withTranslation } from "react-i18next";
import {
  AiOutlineDownload,
  AiOutlineDown,
  AiOutlineRight,
} from "react-icons/ai";
import {
  downloadCanvasAsPng,
  transitionStyle,
  domainsToLocation,
} from "../../helpers/utility";
import ErrorPanel from "../errorPanel";
import * as htmlToImage from "html-to-image";
import logo from "../../assets/images/igv-logo.png";
import Wrapper from "./index.style";
import IgvPlot from "../igvPlot";
import settingsActions from "../../redux/settings/actions";

const { updateDomains } = settingsActions;

const margins = {
  padding: 0,
  gap: 0,
};

class IgvPanel extends Component {
  container = null;
  domains = [];

  state = {
    visible: false,
  };

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.title.replace(/\s+/g, "_").toLowerCase()}.png`
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  handleUpdateDomain = (domain, index) => {
    if (this.props.domains[index]?.toString() !== domain?.toString()) {
      let newDomains = JSON.parse(JSON.stringify(this.props.domains));
      newDomains[index] = domain;
      this.props.updateDomains(newDomains);
    }
  };

  toggleVisibility = (visible) => {
    this.setState({ visible });
  };

  render() {
    const {
      t,
      loading,
      title,
      missingFiles,
      filenameTumor,
      filenameTumorIndex,
      filenameNormal,
      filenameNormalIndex,
      filenameTumorPresent,
      filenameNormalPresent,
      format,
      inViewport,
      renderOutsideViewPort,
      error,
      domains,
      chromoBins,
      dataset,
      id,
    } = this.props;
    const { visible } = this.state;
    let urlTumor = `${dataset.dataPath}${id}/${filenameTumor}`;
    let indexTumorURL = `${dataset.dataPath}${id}/${filenameTumorIndex}`;
    let urlNormal = `${dataset.dataPath}${id}/${filenameNormal}`;
    let indexNormalURL = `${dataset.dataPath}${id}/${filenameNormalIndex}`;
    return (
      <Wrapper>
        {error ? (
          <ErrorPanel
            avatar={<img src={logo} alt="logo" height={16} />}
            header={
              <Space>
                <span className="ant-pro-menu-item-title">
                  {title || t("components.igv-panel.title")}
                </span>
                <span>{domainsToLocation(chromoBins, domains)}</span>
              </Space>
            }
            title={t("components.igv-panel.error.title")}
            subtitle={t("components.igv-panel.error.subtitle", {
              filename: missingFiles.join(", "),
            })}
            explanationTitle={t(
              "components.genome-panel.error.explanation.title"
            )}
            explanationDescription={error}
          />
        ) : (
          <Card
            style={transitionStyle(inViewport || renderOutsideViewPort)}
            loading={loading}
            size="small"
            title={
              <Space>
                <span role="img" className="anticon anticon-dashboard">
                  <img src={logo} alt="logo" height={16} />
                </span>
                <span className="ant-pro-menu-item-title">
                  <Space>
                    <span className="ant-pro-menu-item-title">
                      {title || t("components.igv-panel.title")}
                    </span>
                    <span>{domainsToLocation(chromoBins, domains)}</span>
                  </Space>
                </span>
              </Space>
            }
            extra={
              <Space>
                <Tooltip
                  title={
                    visible ? t("components.collapse") : t("components.expand")
                  }
                >
                  <Button
                    type="text"
                    icon={
                      visible ? (
                        <AiOutlineDown style={{ marginTop: 5 }} />
                      ) : (
                        <AiOutlineRight style={{ marginTop: 5 }} />
                      )
                    }
                    size="small"
                    onClick={() => this.toggleVisibility(!visible)}
                  />
                </Tooltip>
                <Tooltip title={t("components.download-as-png-tooltip")}>
                  <Button
                    type="default"
                    shape="circle"
                    disabled={!visible}
                    icon={<AiOutlineDownload style={{ marginTop: 4 }} />}
                    size="small"
                    onClick={() => this.onDownloadButtonClicked()}
                  />
                </Tooltip>
              </Space>
            }
          >
            {visible && (
              <div
                className="ant-wrapper"
                ref={(elem) => (this.container = elem)}
              >
                {(inViewport || renderOutsideViewPort) && (
                  <Row gutter={[margins.gap, 0]}>
                    {domains.map((domain, index) => (
                      <Col
                        key={index}
                        span={Math.ceil(24 / domains.length)}
                        flex={1}
                      >
                        <IgvPlot
                          {...{
                            index,
                            urlTumor,
                            indexTumorURL,
                            urlNormal,
                            indexNormalURL,
                            filenameTumorPresent,
                            filenameNormalPresent,
                            format,
                            chromoBins,
                            domain,
                            updateDomain: this.handleUpdateDomain,
                          }}
                        />
                      </Col>
                    ))}
                  </Row>
                )}
              </div>
            )}
          </Card>
        )}
      </Wrapper>
    );
  }
}
IgvPanel.propTypes = {};
IgvPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.Settings.renderOutsideViewPort,
  domains: state.Settings.domains,
  chromoBins: state.Settings.chromoBins,
  dataset: state.Settings.dataset,
  id: state.CaseReport.id,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(handleViewport(IgvPanel, { rootMargin: "-1.0px" }))
);
