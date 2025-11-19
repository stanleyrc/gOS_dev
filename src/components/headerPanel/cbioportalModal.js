import React, { Component } from "react";
import { Modal, Space, Input, Row, Col, Form, Skeleton, Button } from "antd";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import cbioportalIcon from "../../assets/images/cbioportal_icon.png";
import FilteredEventsListPanel from "../filteredEventsListPanel";

class CbioportalModal extends Component {
  state = {
    tumorDetails: "",
    disease: "",
    primarySite: "",
    genes: "",
  };

  componentDidMount() {
    const { report } = this.props;
    if (report) {
      this.setState({
        tumorDetails: report.tumor_details || "",
        disease: report.disease || "",
        primarySite: report.primary_site || "",
      });
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.report !== this.props.report && this.props.report) {
      this.setState({
        tumorDetails: this.props.report.tumor_details || "",
        disease: this.props.report.disease || "",
        primarySite: this.props.report.primary_site || "",
      });
    }
  }

  handleInputChange = (field, value) => {
    this.setState({ [field]: value });
  };

  handleClear = () => {
    const { report } = this.props;
    this.setState({
      tumorDetails: report?.tumor_details || "",
      disease: report?.disease || "",
      primarySite: report?.primary_site || "",
      genes: "",
    });
  };

  handleSubmit = () => {
    console.log("cBioPortal form submitted:", this.state);
  };

  render() {
    const { t, visible, onCancel, loading } = this.props;
    const { tumorDetails, disease, primarySite, genes } = this.state;

    return (
      <Modal
        title={
          <Space>
            <img
              src={cbioportalIcon}
              alt="cBioPortal"
              style={{
                height: "24px",
                width: "24px",
                filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))",
              }}
            />
            <span>{t("components.cbioportal-modal.title") || "cBioPortal Integration"}</span>
          </Space>
        }
        visible={visible}
        onCancel={onCancel}
        footer={null}
        width={1200}
        style={{ maxHeight: "90vh" }}
        bodyStyle={{ maxHeight: "calc(90vh - 150px)", overflowY: "auto" }}
      >
        <Skeleton active loading={loading}>
          <Form layout="vertical" style={{ marginBottom: 24 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Tumor Details">
                  <Input
                    value={tumorDetails}
                    onChange={(e) => this.handleInputChange("tumorDetails", e.target.value)}
                    placeholder="Enter tumor details"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Disease">
                  <Input
                    value={disease}
                    onChange={(e) => this.handleInputChange("disease", e.target.value)}
                    placeholder="Enter disease"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Primary Site">
                  <Input
                    value={primarySite}
                    onChange={(e) => this.handleInputChange("primarySite", e.target.value)}
                    placeholder="Enter primary site"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Genes">
                  <Input
                    value={genes}
                    onChange={(e) => this.handleInputChange("genes", e.target.value)}
                    placeholder="Enter genes (comma separated)"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={24} style={{ textAlign: "right" }}>
                <Space>
                  <Button onClick={this.handleClear}>
                    Clear
                  </Button>
                  <Button type="primary" onClick={this.handleSubmit}>
                    Submit
                  </Button>
                </Space>
              </Col>
            </Row>
          </Form>

          <FilteredEventsListPanel />
        </Skeleton>
      </Modal>
    );
  }
}

const mapStateToProps = (state) => ({
  loading: state.FilteredEvents.loading,
  report: state.CaseReport.metadata,
});

export default connect(mapStateToProps)(withTranslation("common")(CbioportalModal));
