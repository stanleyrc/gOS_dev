import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import {
  Space,
  Button,
  Tooltip,
  message,
  Menu,
  Dropdown,
  PageHeader,
} from "antd";
import { AiOutlineDownload, AiOutlineDown } from "react-icons/ai";
import { downloadCanvasAsPng } from "../../helpers/utility";
import html2canvas from "html2canvas";
import Wrapper from "./index.style";
import appActions from "../../redux/app/actions";

const {} = appActions;

class HeaderPanel extends Component {
  onDownloadButtonClicked = () => {
    html2canvas(document.body)
      .then((canvas) => {
        downloadCanvasAsPng(
          canvas,
          `${this.props.selectedFiles
            .map((d) => d.file)
            .join("_")
            .replace(/\s+/g, "_")
            .toLowerCase()}.png`
        );
      })
      .catch((error) => {
        message.error(this.props.t("general.error", { error }));
      });
  };

  render() {
    const { t, selectedFiles } = this.props;
    let tags = [...new Set(selectedFiles.map((d) => d.tags).flat())];
    let title = selectedFiles.map((d) => d.file).join(", ");

    return (
      <Wrapper>
        <PageHeader
          className="site-page-header"
          title={title}
          subTitle={
            selectedFiles.length > 0 && (
              <Space>
                {}
                <Dropdown
                  menu={
                    <Menu>
                      {tags.map((d, i) => (
                        <Menu.Item className="no-click-item" key={d}>
                          {d}
                        </Menu.Item>
                      ))}
                    </Menu>
                  }
                >
                  <a
                    className="ant-dropdown-link"
                    onClick={(e) => e.preventDefault()}
                    href="/#"
                  >
                    <Space>
                      <span className="aligned-center" style={{}}>
                        <span>
                          <b>{tags.length}</b>{" "}
                          {t("containers.home.category", {
                            count: tags.length,
                          })}
                        </span>
                        &nbsp;
                        <AiOutlineDown />
                      </span>
                    </Space>
                  </a>
                </Dropdown>
              </Space>
            )
          }
          extra={
            <Space>
              {selectedFiles.length > 0 && (
                <Tooltip title={t("components.download-as-png-tooltip")}>
                  <Button
                    type="text"
                    shape="circle"
                    icon={<AiOutlineDownload />}
                    size="small"
                    onClick={() => this.onDownloadButtonClicked()}
                  />
                </Tooltip>
              )}
            </Space>
          }
        ></PageHeader>
      </Wrapper>
    );
  }
}
HeaderPanel.propTypes = {
  selectedFiles: PropTypes.array,
};
HeaderPanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({
  tags: state.App.tags,
  selectedFiles: state.App.selectedFiles,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(HeaderPanel));
