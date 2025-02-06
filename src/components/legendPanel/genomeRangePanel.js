import React, { PureComponent } from "react";
import { PropTypes } from "prop-types";
import { Button, Space, Tooltip } from "antd";
import { withTranslation } from "react-i18next";
import { RiResetLeftFill } from "react-icons/ri";
import { connect } from "react-redux";
import settingsActions from "../../redux/settings/actions";

const { updateDomains } = settingsActions;

class GenomeRangePanel extends PureComponent {
  handleResetButtonClick = (e) => {
    e.preventDefault();
    const { defaultDomain, updateDomains } = this.props;
    console.log(defaultDomain);
    updateDomains([defaultDomain]);
  };

  render() {
    const { t } = this.props;
    return (
      <Space>
        <Tooltip title={t("components.genome-range-panel.reset")}>
          <Button
            type="text"
            icon={<RiResetLeftFill style={{ marginTop: 5 }} />}
            size="small"
            onClick={(e) => this.handleResetButtonClick(e)}
          />
        </Tooltip>
      </Space>
    );
  }
}
GenomeRangePanel.propTypes = {};
GenomeRangePanel.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  defaultDomain: state.Settings.defaultDomain,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(GenomeRangePanel));
