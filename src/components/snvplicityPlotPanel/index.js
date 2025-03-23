import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import ContainerDimensions from "react-container-dimensions";
import handleViewport from "react-in-viewport";
import {
  Card,
  Space,
  Tooltip,
  Button,
  message,
  Row,
  Col,
  Tag,
  Segmented,
  Avatar,
} from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import * as d3 from "d3";
import { GiHistogram } from "react-icons/gi";
import {
  downloadCanvasAsPng,
  transitionStyle,
  snvplicityGroups,
  createCnColorScale,
} from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import Wrapper from "./index.style";
import SnvplicityPlot from "../snvplicityPlot";

const margins = {
  padding: 16,
  gap: 0,
};

class SnvplicityPlotPanel extends Component {
  container = null;

  state = {
    selectedCopyNumber: "All",
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

  render() {
    const { t, loading, inViewport, renderOutsideViewPort, visible, data } =
      this.props;

    if (!visible || (data && Object.values(data).flat().length === 0)) {
      return null;
    }

    let distinctCopyNumbers = data
      ? [
          ...new Set(
            Object.values(data)
              .flat()
              .map((d) => d.jabba_cn)
          ),
        ].sort((a, b) => d3.ascending(a, b))
      : [];
    let colorScale = createCnColorScale(distinctCopyNumbers);
    const { selectedCopyNumber } = this.state;

    return (
      <Wrapper visible={visible}>
        <Card
          style={transitionStyle(inViewport || renderOutsideViewPort)}
          loading={loading}
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <GiHistogram />
              </span>
              <span className="ant-pro-menu-item-title">
                {t(`components.snvplicity-panel.header`)}
              </span>
            </Space>
          }
          extra={
            <Space>
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
              <Row gutter={[margins.gap, 0]}>
                <Col className="gutter-row" span={24}>
                  <Space>
                    <span
                      style={{
                        marginRight: 8,
                      }}
                    >
                      {t(`components.snvplicity-panel.filter-by-copy-number`)}:
                    </span>
                    <Segmented
                      options={["All", distinctCopyNumbers]
                        .flat()
                        .map((tag, i) => {
                          return {
                            label: (
                              <div style={{ padding: 4 }}>
                                <Avatar
                                  style={{
                                    backgroundColor:
                                      i === 0 ? "gray" : colorScale(tag),
                                  }}
                                >
                                  {tag}
                                </Avatar>
                              </div>
                            ),
                            value: tag,
                          };
                        })}
                      onChange={(value) =>
                        this.setState({ selectedCopyNumber: value })
                      }
                      value={selectedCopyNumber}
                    />
                  </Space>
                </Col>
              </Row>
              {d3
                .groups(snvplicityGroups(), (d) => d.type)
                .map((d, i) => (
                  <Row
                    className="gutter-row"
                    key={d[0]}
                    gutter={[margins.gap, 0]}
                  >
                    {d[1]
                      .filter(
                        (group) =>
                          data &&
                          data[[group.type, group.mode].join("_")].length > 0
                      )
                      .map((group) => (
                        <Col
                          key={group.type + "_" + group.mode}
                          className="gutter-row"
                          span={24 / d[1].length}
                        >
                          <ContainerDimensions>
                            {({ width, height }) => {
                              return (
                                (inViewport || renderOutsideViewPort) &&
                                data &&
                                data[[group.type, group.mode].join("_")] && (
                                  <SnvplicityPlot
                                    {...{
                                      width,
                                      height: 400,
                                      data: data[
                                        [group.type, group.mode].join("_")
                                      ],
                                      colorScale,
                                      selectedCopyNumber,
                                      xTitle: t(
                                        `components.snvplicity-panel.x-title`
                                      ),
                                      yTitle: t(
                                        `components.snvplicity-panel.y-title`
                                      ),
                                      title: (
                                        <span
                                          dangerouslySetInnerHTML={{
                                            __html: t(
                                              `components.snvplicity-panel.title`,
                                              {
                                                type: t(
                                                  `components.snvplicity-panel.${group.type}`
                                                ),
                                                mode: t(
                                                  `components.snvplicity-panel.${group.mode}`
                                                ),
                                              }
                                            ),
                                          }}
                                        />
                                      ),
                                    }}
                                  />
                                )
                              );
                            }}
                          </ContainerDimensions>
                        </Col>
                      ))}
                  </Row>
                ))}
            </div>
          )}
        </Card>
      </Wrapper>
    );
  }
}
SnvplicityPlotPanel.propTypes = {};
SnvplicityPlotPanel.defaultProps = {
  visible: true,
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  data: state.Snvplicity.data,
  loading: state.Snvplicity.loading,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(SnvplicityPlotPanel, { rootMargin: "-1.0px" })
  )
);
