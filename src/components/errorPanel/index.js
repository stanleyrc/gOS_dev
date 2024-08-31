import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import { connect } from "react-redux";
import { Space, Result, Typography, Card } from "antd";
import Wrapper from "./index.style";
import { CloseCircleOutlined } from "@ant-design/icons";

const { Paragraph, Text } = Typography;

class ErrorView extends Component {
  render() {
    const {
      avatar,
      header,
      title,
      subtitle,
      explanationTitle,
      explanationDescription,
    } = this.props;

    return (
      <Wrapper>
        <Card
          size="small"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                {avatar}
              </span>
              <span className="ant-pro-menu-item-title">{header}</span>
            </Space>
          }
        >
          <Result
            status="error"
            title={
              <span
                dangerouslySetInnerHTML={{
                  __html: title,
                }}
              />
            }
            subTitle={
              <span
                dangerouslySetInnerHTML={{
                  __html: subtitle,
                }}
              />
            }
          >
            <div className="desc">
              <Paragraph>
                <Text className="site-result-error-title">
                  {
                    <span
                      dangerouslySetInnerHTML={{
                        __html: explanationTitle,
                      }}
                    />
                  }
                </Text>
              </Paragraph>
              <Paragraph>
                <Space>
                  <CloseCircleOutlined className="site-result-error-icon" />
                  {explanationDescription}
                </Space>
              </Paragraph>
            </div>
          </Result>
        </Card>
      </Wrapper>
    );
  }
}
ErrorView.propTypes = {};
ErrorView.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(ErrorView)));
