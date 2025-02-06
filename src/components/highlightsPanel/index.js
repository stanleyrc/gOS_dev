import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import { connect } from "react-redux";
import {
  Tag,
  Table,
  Button,
  Space,
  Row,
  Col,
  Segmented,
  Card,
  Tooltip,
  message,
  Typography,
  Descriptions,
} from "antd";
import { AiOutlineDownload } from "react-icons/ai";
import { downloadCanvasAsPng, transitionStyle } from "../../helpers/utility";
import { FaDna } from "react-icons/fa";
import Wrapper from "./index.style";
import * as htmlToImage from "html-to-image";

const { Text } = Typography;
const { Item } = Descriptions;
class HighlightsPanel extends Component {
  container = null;

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
    const { t, title, data, error, renderOutsideViewPort, inViewport } =
      this.props;
    if (error) {
      return null;
    }
    console.log(data);
    const { karyotype, gene_mutations } = data;
    return (
      <Wrapper ref={(elem) => (this.container = elem)}>
        <Row className="ant-panel-container ant-home-plot-container">
          <Col className="gutter-row table-container" span={24}>
            <Card
              style={transitionStyle(inViewport || renderOutsideViewPort)}
              size="small"
              title={
                <Space>
                  <span role="img" className="anticon anticon-dashboard">
                    <FaDna />
                  </span>
                  <span className="ant-pro-menu-item-title">{title}</span>
                </Space>
              }
              extra={
                <Space>
                  <Tooltip title={t("components.download-as-png-tooltip")}>
                    <Button
                      type="default"
                      shape="circle"
                      icon={<AiOutlineDownload style={{ marginTop: 4 }} />}
                      size="small"
                      onClick={() => this.onDownloadButtonClicked()}
                    />
                  </Tooltip>
                </Space>
              }
            >
              <Descriptions bordered size="small">
                {karyotype && (
                  <Item
                    label={t("components.highlights-panel.karyotype")}
                    span={3}
                  >
                    {karyotype}
                  </Item>
                )}
                {(gene_mutations || []).map((d, i) => (
                  <Item
                    label={t("components.highlights-panel.gene-mutations", {
                      value: i + 1,
                    })}
                    span={3}
                  >
                    <Space>
                      {[
                        "gene_name",
                        "variant_p",
                        "vaf",
                        "altered_copies",
                        "total_copies",
                        "alteration_type",
                        "aggregate_label",
                      ]
                        .filter((x) => !!d[x])
                        .map((x) => (
                          <Space>
                            {t(`components.highlights-panel.${x}`, {
                              value: d[x],
                            })}
                          </Space>
                        ))}
                    </Space>
                  </Item>
                ))}
              </Descriptions>
            </Card>
          </Col>
        </Row>
      </Wrapper>
    );
  }
}
HighlightsPanel.propTypes = {};
HighlightsPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  loading: state.Highlights.loading,
  data: state.Highlights.data,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(HighlightsPanel)));
