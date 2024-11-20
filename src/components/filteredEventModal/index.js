import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import handleViewport from "react-in-viewport";
import {
  Row,
  Col,
  Modal,
  message,
  Space,
  Button,
  Descriptions,
  Tag,
  Avatar,
} from "antd";
import { withTranslation } from "react-i18next";
import { AiOutlineDownload } from "react-icons/ai";
import { roleColorMap, tierColor } from "../../helpers/utility";
import * as htmlToImage from "html-to-image";
import { downloadCanvasAsPng } from "../../helpers/utility";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const { Item } = Descriptions;

class FilteredEventModal extends Component {
  container = null;

  onDownloadButtonClicked = () => {
    htmlToImage
      .toCanvas(this.container, { pixelRatio: 2 })
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.modalTitleText.replace(/\s+/g, "_").toLowerCase()}.png`
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  render() {
    const { t, record, handleOkClicked, handleCancelClicked, width, open } =
      this.props;
    if (!open) return null;
    const {
      gene,
      name,
      type,
      role,
      tier,
      location,
      therapeutics,
      resistances,
      diagnoses,
      prognoses,
      variant_summary,
      gene_summary,
      mutation_effect_description,
    } = record;

    let content = (
      <Row
        className="ant-panel-container ant-home-plot-container"
        gutter={[16, 24]}
      >
        <Col className="gutter-row" span={24}>
          <Descriptions
            title={t("components.filtered-events-panel.info")}
            bordered
            layout="vertical"
          >
            <Item label={t("components.filtered-events-panel.gene")}>
              <a
                href="#/"
                onClick={(e) => {
                  e.preventDefault();
                  window
                    .open(
                      `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${gene}`,
                      "_blank"
                    )
                    .focus();
                }}
              >
                {gene}
              </a>
            </Item>
            <Item label={t("components.filtered-events-panel.tier")}>
              {tier ? (
                <Space>
                  <Avatar
                    size="small"
                    style={{
                      color: "#FFF",
                      backgroundColor: tierColor(+tier),
                    }}
                  >
                    {tier}
                  </Avatar>
                  {t(`components.filtered-events-panel.tier-info.${tier}`)}
                </Space>
              ) : (
                t("components.filtered-events-panel.unavailable", {
                  value: "tier",
                })
              )}
            </Item>
            <Item label={t("components.filtered-events-panel.variant_summary")}>
              {variant_summary
                ? variant_summary
                : t("components.filtered-events-panel.unavailable", {
                    value: t(
                      "components.filtered-events-panel.variant_summary"
                    ),
                  })}
            </Item>
            <Item label={t("components.filtered-events-panel.gene_summary")}>
              {gene_summary
                ? gene_summary
                : t("components.filtered-events-panel.unavailable", {
                    value: t("components.filtered-events-panel.gene_summary"),
                  })}
            </Item>
            <Item
              label={t(
                "components.filtered-events-panel.mutation_effect_description"
              )}
            >
              {mutation_effect_description
                ? mutation_effect_description
                : t("components.filtered-events-panel.unavailable", {
                    value: t(
                      "components.filtered-events-panel.mutation_effect_description"
                    ),
                  })}
            </Item>
            <Item label={t("components.filtered-events-panel.therapeutics")}>
              {therapeutics
                ? therapeutics
                : t("components.filtered-events-panel.unavailable", {
                    value: "therapeutics",
                  })}
            </Item>
            <Item label={t("components.filtered-events-panel.resistances")}>
              {resistances
                ? resistances
                : t("components.filtered-events-panel.unavailable", {
                    value: "resistances",
                  })}
            </Item>
            <Item label={t("components.filtered-events-panel.diagnoses")}>
              {diagnoses
                ? diagnoses
                : t("components.filtered-events-panel.unavailable", {
                    value: "diagnoses",
                  })}
            </Item>
            <Item label={t("components.filtered-events-panel.prognoses")}>
              {prognoses
                ? prognoses
                : t("components.filtered-events-panel.unavailable", {
                    value: "prognoses",
                  })}
            </Item>
          </Descriptions>
        </Col>
      </Row>
    );
    return (
      <Wrapper visible={open}>
        <Modal
          title={
            <Space>
              {gene}
              {name}
              {type}
              {role?.split(",").map((tag) => (
                <Tag color={roleColorMap()[tag.trim()]} key={tag.trim()}>
                  {tag.trim()}
                </Tag>
              ))}
              {tier}
              {location}
              <Button
                type="default"
                shape="circle"
                icon={<AiOutlineDownload />}
                size="small"
                onClick={() => this.onDownloadButtonClicked()}
              />
            </Space>
          }
          centered
          open={open}
          onOk={handleOkClicked}
          onCancel={handleCancelClicked}
          width={width}
          footer={null}
          forceRender={true}
        >
          <div ref={(elem) => (this.container = elem)}>{content}</div>
        </Modal>
      </Wrapper>
    );
  }
}
FilteredEventModal.propTypes = {};
FilteredEventModal.defaultProps = {
  width: 1800,
  height: 180,
  viewType: "modal",
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(
  withTranslation("common")(
    handleViewport(FilteredEventModal, { rootMargin: "-1.0px" })
  )
);
