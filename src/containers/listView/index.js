import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { connect } from "react-redux";
import GoslingChat from '../../components/goslingChat';
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
import {
  snakeCaseToHumanReadable,
  orderListViewFilters,
} from "../../helpers/utility";
import Wrapper from "./index.style";

const { Meta } = Card;
const { Option } = Select;
const { Text } = Typography;

class ListView extends Component {
  formRef = React.createRef();

  state = {
    isChatOpen: false
  };

  handleChatClick = () => {
    this.setState(prevState => ({
      isChatOpen: !prevState.isChatOpen
    }));
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
    this.props.onSearch({
      ...emptySearchValues,
      ...{ page: 1, per_page: 10, orderId: 1 },
    });
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

  onOrderChanged = (orderId) => {
    let fieldValues = this.formRef.current.getFieldsValue();
    let searchFilters = {
      ...this.props.searchFilters,
      ...fieldValues,
      ...{ page: 1, per_page: 10, orderId },
    };
    this.props.onSearch(searchFilters);
  };

  onValuesChange = (values) => {
    this.props.onSearch({
      ...this.props.searchFilters,
      ...this.formRef.current.getFieldsValue(),
      page: 1,
      per_page: 10,
      orderId: 1,
    });
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
        <Form
          layout="horizontal"
          ref={this.formRef}
          onFinish={this.onValuesChange}
          onValuesChange={this.onValuesChange}
        >
          <div className="ant-panel-list-container">
            <Row gutter={[16, 16]}>
              <Col className="gutter-row" span={24}>
                <Card className="filters-box">
                  <Row>
                    {filters.map((d) => (
                      <Col className="gutter-row" span={4}>
                        <Form.Item
                          key={`containers.list-view.filters.${d.filter}`}
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
                            {d.records.map((e, i) => (
                              <Option key={i} value={e}>
                                {e
                                  ? snakeCaseToHumanReadable(e)
                                  : t("containers.list-view.filters.empty")}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                    ))}
                    <Col className="gutter-row" span={4}>
                      <Space>
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
                      </Space>
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>
            {records.length > 0 && (
              <Row className="results-top-box" gutter={[16, 16]}>
                <Col className="gutter-row" span={12}>
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
                <Col className="gutter-row order-selector-container" span={12}>
                  <Select
                    className="order-select"
                    value={searchFilters.orderId}
                    onSelect={this.onOrderChanged}
                    bordered={false}
                  >
                    {orderListViewFilters.map((d) => (
                      <Option key={d.id} value={d.id}>
                        <span
                          dangerouslySetInnerHTML={{
                            __html: t("containers.list-view.ordering", {
                              attribute: t(`metadata.${d.attribute}.short`),
                              sort: d.sort,
                            }),
                          }}
                        />
                      </Option>
                    ))}
                  </Select>
                </Col>
              </Row>
            )}

            <Row gutter={[16, 16]}>
              {records.map((d) => (
                <Col key={d.pair} className="gutter-row" span={6}>
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
                        value={
                          d.sv_count != null
                            ? d3.format(",")(d.sv_count)
                            : t("general.not-applicable")
                        }
                      />,
                      <Statistic
                        className="stats"
                        title={t(`metadata.tmb.short`)}
                        value={
                          d.tmb != null
                            ? d3.format(",")(d.tmb)
                            : t("general.not-applicable")
                        }
                      />,
                      <Statistic
                        className="stats"
                        title={t(`metadata.lohFraction.short`)}
                        value={
                          d.loh_fraction != null
                            ? d3.format(".3f")(d.loh_fraction)
                            : t("general.not-applicable")
                        }
                      />,
                      <Statistic
                        className="stats"
                        title={t("metadata.purity-ploidy-title")}
                        value={
                          d.purity != null
                            ? d3.format(".3f")(d.purity)
                            : t("general.not-applicable")
                        }
                        suffix={`/ ${
                          d.ploidy != null
                            ? d3.format(".3f")(d.ploidy)
                            : t("general.not-applicable")
                        }`}
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
            </Row>
            {records.length > 0 && (
              <Row className="results-bottom-box" gutter={[16, 16]}>
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
              </Row>
            )}

            {records.length < 1 && (
              <Row gutter={[16, 16]}>
                <Col className="gutter-row" span={24}>
                  <Card>
                    <Empty description={false} />
                  </Card>
                </Col>
              </Row>
            )}
          </div>
        </Form>
      {this.state.isChatOpen && <GoslingChat onClose={this.handleChatClick} />}
      <Button
        type="primary"
        shape="circle"
        onClick={this.handleChatClick}
        className="chat-float-button"
      >
        🐦
      </Button>
    </Wrapper>
    );
  }
}
ListView.propTypes = {};
ListView.defaultProps = {
  searchFilters: { per_page: 10, page: 1, orderId: 1 },
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ListView));
