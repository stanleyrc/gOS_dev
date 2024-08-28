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
  Select,
  Form,
  Button,
  Empty,
  Pagination,
  Typography,
} from "antd";
import * as d3 from "d3";
import { snakeCaseToHumanReadable } from "../../helpers/utility";
import Wrapper from "./index.style";

const { Meta } = Card;
const { Option } = Select;
const { Text } = Typography;

class ListView extends Component {
  formRef = React.createRef();

  onValuesChange = (values) => {
    this.props.onSearch({
      ...this.props.searchFilters,
      ...this.formRef.current.getFieldsValue(),
      page: 1,
      per_page: 10,
    });
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
    this.props.onSearch({ ...emptySearchValues, ...{ page: 1, per_page: 10 } });
  };

  onPageChanged = (page, per_page) => {
    let fieldValues = this.formRef.current.getFieldsValue();
    let searchFilters = {
      ...this.props.searchFilters,
      ...fieldValues,
      ...{ page: page, per_page: per_page },
    };
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
                  onFinish={this.onValuesChange}
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
                        style={{ width: 200 }}
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
            {records.length > 0 && (
              <Col className="gutter-row" span={24}>
                <Pagination
                  showSizeChanger
                  total={totalRecords}
                  showTotal={(total, range) =>
                    `${range[0]}-${range[1]} of ${total} items`
                  }
                  defaultCurrent={1}
                  current={searchFilters.page || 1}
                  pageSize={searchFilters.per_page || 10}
                  onChange={this.onPageChanged}
                />
              </Col>
            )}
            {records.map((d) => (
              <Col className="gutter-row" span={6}>
                <Card
                  className="case-report-card"
                  onClick={(e) => handleCardClick(e, d.pair)}
                  hoverable
                  title={
                    <Space>
                      <b>{d.pair}</b>
                      <Text type="secondary">{d.inferred_sex}</Text>
                    </Space>
                  }
                  bordered={false}
                  extra={
                    <Avatar
                      style={{
                        backgroundColor: "#fde3cf",
                        color: "#f56a00",
                      }}
                    >
                      {d.tumor_type}
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
                      title={t(`metadata.hrdScore.short`)}
                      value={d3.format(",")(d.hrd_score)}
                    />,
                    <Statistic
                      className="stats"
                      title={t(`metadata.tmb.short`)}
                      value={d3.format(",")(d.tmb)}
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
                      d.primary_site
                        ? snakeCaseToHumanReadable(d.primary_site)
                        : t("containers.list-view.filters.empty")
                    }
                  />
                </Card>
              </Col>
            ))}
            {records.length > 0 && (
              <Col className="gutter-row" span={24}>
                <Pagination
                  showSizeChanger
                  total={totalRecords}
                  showTotal={(total, range) =>
                    `${range[0]}-${range[1]} of ${total} items`
                  }
                  defaultCurrent={1}
                  current={searchFilters.page || 1}
                  pageSize={searchFilters.per_page || 10}
                  onChange={this.onPageChanged}
                />
              </Col>
            )}
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
ListView.defaultProps = {
  searchFilters: { per_page: 10, page: 1 },
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ListView));
