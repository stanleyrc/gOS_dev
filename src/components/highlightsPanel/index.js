import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import { connect } from "react-redux";
import {
  Button,
  Space,
  Row,
  Col,
  Card,
  Tooltip,
  message,
  Skeleton,
  Typography,
  Table,
  Tag,
} from "antd";
import { AiOutlineDownload } from "react-icons/ai";
import { downloadCanvasAsPng, transitionStyle } from "../../helpers/utility";
import { riskColorMap } from "../../helpers/highlights";
import * as d3 from "d3";
import { FaDna } from "react-icons/fa";
import Wrapper from "./index.style";
import * as htmlToImage from "html-to-image";

const { Text } = Typography;

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
    const { t, loading, title, data, inViewport } =
      this.props;
    if (!data) {
      return null;
    }

    const { karyotype, risk_score, gene_mutations } = data;
    const riskTags =
      Array.isArray(risk_score) && risk_score.length > 0
        ? risk_score.map((entry, idx) => {
            const [key, value] = Object.entries(entry)[0];
            return (
              <Space key={idx}>
                <span
                  dangerouslySetInnerHTML={{
                    __html: t("components.highlights-panel.risk-score", {
                      value: key,
                    }),
                  }}
                />
                <Tag color={riskColorMap[value] || "default"}>{value}</Tag>
              </Space>
            );
          })
        : null;
    let records = gene_mutations || [];
    const columns = [
      "alteration_type",
      "gene_name",
      "variant",
      "aggregate_label",
      "tier",
      "indication",
    ].map((x) => {
      return {
        title: t(`components.highlights-panel.${x}`),
        dataIndex: x,
        key: x,
        filters: [...new Set(records.map((d) => d[x]).flat())]
          .sort((a, b) => d3.ascending(a, b))
          .map((d) => {
            return {
              text: d,
              value: d,
            };
          }),
        filterMultiple: true,
        onFilter: (value, record) =>
          record[x].includes(value) || record[x] === value,
        filterSearch: true,
        sorter: {
          compare: (a, b) => {
            if (a[x] == null) return 1;
            if (b[x] == null) return -1;
            return d3.ascending(a[x], b[x]);
          },
        },
        render: (_, record) =>
          Array.isArray(record[x]) ? (
            record[x].map((e) => <Tag>{e}</Tag>)
          ) : (
            <Text>{record[x]}</Text>
          ),
      };
    });
    return (
      <Wrapper ref={(elem) => (this.container = elem)}>
        <Row className="ant-panel-container ant-home-plot-container">
          <Col className="gutter-row table-container" span={24}>
            <Card
              style={transitionStyle(inViewport)}
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
              <Skeleton active loading={loading}>
                <Table
                  columns={columns}
                  dataSource={records}
                  pagination={{ pageSize: 50 }}
                  showSorterTooltip={false}
                  bordered
                  title={() => (
                    <Space direction="vertical" size="small">
                      <Space>
                        <strong>
                          {t("components.highlights-panel.karyotype")}:
                        </strong>
                        {karyotype}
                      </Space>
                      {riskTags}
                    </Space>
                  )}
                />
              </Skeleton>
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
  loading: state.Highlights.loading,
  data: state.Highlights.data,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(HighlightsPanel)));
