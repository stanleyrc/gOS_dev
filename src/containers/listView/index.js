import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import {
  Row,
  Col,
  Card,
  Statistic,
  Avatar,
  Space,
  Divider,
  Select,
  Form,
  Button,
  Empty,
  Pagination,
} from "antd";
import * as d3 from "d3";
import { snakeCaseToHumanReadable } from "../../helpers/utility";
import Wrapper from "./index.style";

const { Meta } = Card;
const { Option } = Select;

class ListView extends Component {
  formRef = React.createRef();

  onFinish = (values) => {
    this.props.onSearch(values);
  };

  onValuesChange = (values) => {
    this.props.onSearch(this.formRef.current.getFieldsValue());
  };

  onReset = () => {
    this.formRef.current.resetFields();
    let emptySearchValues = Object.keys(this.props.searchFilters).reduce(
      (acc, key) => {
        acc[key] = [];
        return acc;
      },
      {}
    );
    this.props.onSearch(emptySearchValues);
  };

  onPageChanged = (page) => {
    console.log(page);
    let searchFilters = this.formRef.current.getFieldsValue();
    searchFilters.page = page;
    this.props.onSearch(searchFilters);
  };

  render() {
    const {
      t,
      records,
      handleCardClick,
      filters,
      searchFilters,
      totalRecords,
    } = this.props;

    return (
      <Wrapper>
        <div className="ant-panel-list-container">
          <Row gutter={[16, 16]}>
            <Col className="gutter-row" span={24}>
              <Card>
                <Form
                  layout="inline"
                  ref={this.formRef}
                  onFinish={this.onFinish}
                  onValuesChange={this.onValuesChange}
                  initialValues={searchFilters}
                >
                  {filters.map((d) => (
                    <Form.Item
                      name={d.filter}
                      label={t(`containers.list-view.filters.${d.filter}`)}
                      rules={[
                        {
                          required: false,
                        },
                      ]}
                    >
                      <Select
                        placeholder={t(
                          "containers.list-view.filters.placeholder"
                        )}
                        mode="multiple"
                        allowClear
                        style={{ width: 210 }}
                        maxTagCount="responsive"
                        maxTagTextLength={5}
                      >
                        {d.records.map((e) => (
                          <Option value={e}>
                            {e
                              ? snakeCaseToHumanReadable(e)
                              : t("containers.list-view.filters.empty")}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  ))}
                  <Form.Item>
                    <Button type="primary" htmlType="submit">
                      {t("containers.list-view.filters.submit")}
                    </Button>
                  </Form.Item>
                  <Form.Item>
                    <Button htmlType="button" onClick={this.onReset}>
                      {t("containers.list-view.filters.reset")}
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </Col>
            <Col className="gutter-row" span={24}>
              <Pagination
                total={totalRecords}
                showTotal={(total, range) =>
                  `${range[0]}-${range[1]} of ${total} items`
                }
                defaultCurrent={1}
                onChange={this.onPageChanged}
              />
            </Col>
            {records.map((d) => (
              <Col className="gutter-row" span={4}>
                <Card
                  className="case-report-card"
                  onClick={(e) => handleCardClick(d.pair)}
                  hoverable
                  title={<b>{d.pair}</b>}
                  bordered={false}
                  extra={
                    <Avatar
                      style={{
                        backgroundColor: "#fde3cf",
                        color: "#f56a00",
                      }}
                    >
                      {d.tumor_type_final}
                    </Avatar>
                  }
                  actions={[
                    <Statistic
                      className="stats"
                      title={t(`metadata.svCount.short`)}
                      value={d3.format(",")(d.sv_count)}
                    />,
                    <Statistic
                      className="stats"
                      title={t(`metadata.lohFraction.short`)}
                      value={d3.format(".2%")(d.loh_fraction)}
                    />,
                    <Statistic
                      className="stats"
                      title={t("metadata.purity-ploidy-title")}
                      value={d3.format(".2f")(d.purity)}
                      suffix={`/ ${d3.format(".2f")(d.ploidy)}`}
                    />,
                  ]}
                >
                  <Meta
                    title={d.disease}
                    description={
                      <Space split={<Divider type="vertical" />}>
                        {d.inferred_sex}
                        {d.primary_site
                          ? snakeCaseToHumanReadable(d.primary_site)
                          : t("containers.list-view.filters.empty")}
                      </Space>
                    }
                  />
                </Card>
              </Col>
            ))}
            {records.length < 1 && (
              <Col className="gutter-row" span={24}>
                <Card>
                  <Empty description={false} />
                </Card>
              </Col>
            )}
          </Row>
        </div>
      </Wrapper>
    );
  }
}
ListView.propTypes = {};
ListView.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ListView));
