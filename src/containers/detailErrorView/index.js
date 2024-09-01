import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
import { connect } from "react-redux";
import { Result, Typography, Button, Space } from "antd";
import { CloseCircleOutlined } from "@ant-design/icons";
import Wrapper from "./index.style";
import settingsActions from "../../redux/settings/actions";

const { updateCaseReport } = settingsActions;
const { Paragraph, Text } = Typography;

class DetailErrorView extends Component {
  render() {
    const { t, id, error, updateCaseReport } = this.props;
    return (
      <Wrapper>
        <Result
          status="error"
          title={
            <span
              dangerouslySetInnerHTML={{
                __html: t("containers.detail-error-view.title", { id }),
              }}
            />
          }
          subTitle={t("containers.detail-error-view.subtitle")}
          extra={[
            <Button
              type="link"
              key="home"
              onClick={() => {
                updateCaseReport();
              }}
            >
              {t("containers.detail-error-view.button")}
            </Button>,
          ]}
        >
          <div className="desc">
            <Paragraph>
              <Text className="site-result-error-title">
                {t("containers.detail-error-view.explanation.title")}
              </Text>
            </Paragraph>
            <Paragraph>
              <Space>
                <CloseCircleOutlined className="site-result-error-icon" />
                {error.stack}
              </Space>
            </Paragraph>
          </div>
        </Result>
      </Wrapper>
    );
  }
}
DetailErrorView.propTypes = {};
DetailErrorView.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateCaseReport: (report) => dispatch(updateCaseReport(report)),
});
const mapStateToProps = (state) => ({
  id: state.CaseReport.id,
  error: state.CaseReport.error,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withTranslation("common")(DetailErrorView)));
