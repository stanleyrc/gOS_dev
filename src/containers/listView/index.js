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
  Cascader,
  Flex,
  Divider,
  Slider,
  Collapse,
} from "antd";
import * as d3 from "d3";
import {
  snakeCaseToHumanReadable,
  orderListViewFilters,
} from "../../helpers/utility";
import {
  generateCascaderOptions,
  cascaderOperators,
} from "../../helpers/filters";
import Wrapper from "./index.style";

const { SHOW_CHILD } = Cascader;

const { Meta } = Card;
const { Option } = Select;
const { Text } = Typography;
const { Compact } = Space;
const { Item } = Form;

class ListView extends Component {
  formRef = React.createRef();

  state = {
    isChatOpen: false,
  };

  handleChatClick = () => {
    this.setState((prevState) => ({
      isChatOpen: !prevState.isChatOpen,
    }));
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

  onReset = () => {
    const { filters } = this.props;
    // Build reset values: sliders use their extent, others empty array
    const resetValues = filters.reduce((acc, d) => {
      const name = d.filter.name;
      if (d.filter.renderer === "slider") {
        acc[name] = d.extent;
      } else {
        acc[name] = [];
      }
      return acc;
    }, {});
    resetValues["operator"] = cascaderOperators[0]; // default operator
    // Update form fields
    this.formRef.current.setFieldsValue(resetValues);
    // Trigger search with reset values and pagination defaults
    this.props.onSearch({
      ...resetValues,
      page: 1,
      per_page: 10,
      orderId: 1,
    });
  };

  componentDidUpdate(prevProps) {
    if (prevProps.searchFilters !== this.props.searchFilters) {
      this.formRef.current.setFieldsValue(this.props.searchFilters);
    }
  }

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

  tagsDisplayRender = (labels, selectedOptions = []) =>
    labels.map((label, i) => {
      const option = selectedOptions[i];
      if (i === labels.length - 1) {
        return <span key={option?.value}>{label}</span>;
      }
      return <span key={option?.value}>{label}: </span>;
    });

  render() {
    const {
      t,
      records,
      handleCardClick,
      filters,
      searchFilters,
      totalRecords,
    } = this.props;

    let filterFormItemRenderer = (d) => {
      if (d.filter.renderer === "cascader") {
        return (
          <Compact block className="tags-container">
            <Item
              key={`containers.list-view.filters.${d.filter.name}-operator`}
              className="tags-operator-item"
              name={`operator`}
              label={t(
                `containers.list-view.filters.${d.filter.name}-operator`
              )}
              rules={[
                {
                  required: false,
                },
              ]}
            >
              <Select className="tags-operators-select">
                {cascaderOperators.map((e, i) => (
                  <Option key={i} value={e}>
                    {t(`containers.list-view.filters.operators.${e}`)}
                  </Option>
                ))}
              </Select>
            </Item>
            <Item
              key={`containers.list-view.filters.${d.filter.name}`}
              className="tags-cascader-item"
              name={d.filter.name}
              label={t(`containers.list-view.filters.${d.filter.name}`)}
              rules={[
                {
                  required: false,
                },
              ]}
            >
              <Cascader
                placeholder={t("containers.list-view.filters.placeholder")}
                className="tags-cascader"
                options={generateCascaderOptions(d.records)}
                displayRender={this.tagsDisplayRender}
                multiple
                showSearch={(inputValue, path) =>
                  path.some(
                    (option) =>
                      option.label
                        .toLowerCase()
                        .indexOf(inputValue.toLowerCase()) > -1
                  )
                }
                maxTagCount="responsive"
                showCheckedStrategy={SHOW_CHILD}
                allowClear
              />
            </Item>
          </Compact>
        );
      }

      if (d.filter.renderer === "select") {
        return (
          <Item
            key={`containers.list-view.filters.${d.filter.name}`}
            name={d.filter.name}
            label={t(`containers.list-view.filters.${d.filter.name}`)}
            rules={[
              {
                required: false,
              },
            ]}
          >
            <Select
              placeholder={t("containers.list-view.filters.placeholder")}
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              maxTagCount="responsive"
              maxTagTextLength={8}
              disabled={
                d.records.length === 0 || d.records.every((e) => e == null)
              }
            >
              {d.records.map((e, i) => (
                <Option key={i} value={e || "null"}>
                  {e
                    ? snakeCaseToHumanReadable(e)
                    : t("containers.list-view.filters.empty")}
                </Option>
              ))}
            </Select>
          </Item>
        );
      }

      if (
        d.filter.renderer === "slider" &&
        !isNaN(d.extent[0]) &&
        !isNaN(d.extent[1])
      ) {
        return (
          <Item
            key={`containers.list-view.filters.${d.filter.name}`}
            name={d.filter.name}
            label={t(`containers.list-view.filters.${d.filter.name}`)}
            rules={[
              {
                required: false,
              },
            ]}
            initialValue={d.extent}
          >
            <Slider
              range
              min={d.extent[0]}
              max={d.extent[1]}
              step={(d.extent[1] - d.extent[0]) / 100}
              marks={{
                [d.extent[0]]: d3.format(d.format)(d.extent[0]),
                [d.extent[1]]: d3.format(d.format)(d.extent[1]),
              }}
              tooltip={{
                formatter: (value) => d3.format(d.format)(value),
              }}
            />
          </Item>
        );
      }
      return null; // nothing for unknown renderer
    };

    return (
      <Wrapper>
        <Form
          layout="vertical"
          initialValues={searchFilters}
          ref={this.formRef}
          onFinish={this.onValuesChange}
          onValuesChange={this.onValuesChange}
        >
          <div className="ant-panel-list-container">
            <Row gutter={[16, 16]} align="stretch">
              <Col className="gutter-row" span={4} style={{ display: "flex" }}>
                <Card
                  className="filters-box"
                  title={t("containers.list-view.filters.title")}
                  style={{ flex: 1, display: "flex", flexDirection: "column" }}
                >
                  <>
                    {filters
                      .filter((d) => d.filter.group == null)
                      .map((e) => filterFormItemRenderer(e))}
                  </>
                  <Collapse
                    className="filters-collapse"
                    ghost
                    items={d3
                      .groups(
                        filters.filter((d) => d.filter.group != null),
                        (d) => d.filter.group
                      )
                      .map(([group, filteredGroups]) => {
                        return {
                          key: group,
                          label: t(
                            `containers.list-view.filters.collapse.${group}`
                          ),
                          children: (
                            <>
                              {filteredGroups.map((e) =>
                                filterFormItemRenderer(e)
                              )}
                            </>
                          ),
                        };
                      })}
                  />
                  <Space>
                    <Item>
                      <Button type="primary" htmlType="submit">
                        {t("containers.list-view.filters.submit")}
                      </Button>
                    </Item>
                    <Item>
                      <Button htmlType="button" onClick={this.onReset}>
                        {t("containers.list-view.filters.reset")}
                      </Button>
                    </Item>
                  </Space>
                </Card>
              </Col>
              <Col className="gutter-row" span={20}>
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
                    <Col
                      className="gutter-row order-selector-container"
                      span={12}
                    >
                      <Select
                        className="order-select"
                        value={searchFilters.orderId}
                        onSelect={this.onOrderChanged}
                        variant="borderless"
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
                    <Col
                      key={d.pair}
                      className="gutter-row"
                      span={6}
                      style={{ display: "flex" }}
                    >
                      <Card
                        className="case-report-card"
                        styles={{
                          body: {
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                          },
                        }}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                        }}
                        onClick={(e) => handleCardClick(e, d.pair)}
                        hoverable
                        title={
                          <Space>
                            <b>{d.pair}</b>
                            <Text type="secondary">{d.inferred_sex}</Text>
                          </Space>
                        }
                        variant="borderless"
                        extra={
                          d.tumor_type ? (
                            <Avatar
                              style={{
                                backgroundColor: "#fde3cf",
                                color: "#f56a00",
                              }}
                            >
                              {d.tumor_type}
                            </Avatar>
                          ) : null
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
                            title={t(`metadata.tumor_median_coverage.shorter`)}
                            value={`${
                              d["tumor_median_coverage"] != null
                                ? `${d["tumor_median_coverage"]}X`
                                : t("general.not-applicable")
                            } / ${
                              d["normal_median_coverage"] != null
                                ? `${d["normal_median_coverage"]}X`
                                : t("general.not-applicable")
                            }`}
                          />,
                          <Statistic
                            className="stats"
                            title={t("metadata.purity-ploidy-title")}
                            value={
                              d.purity != null
                                ? d3.format(".1%")(d.purity)
                                : t("general.not-applicable")
                            }
                            suffix={`/ ${
                              d.ploidy != null
                                ? d3.format(".2f")(d.ploidy)
                                : t("general.not-applicable")
                            }`}
                          />,
                        ]}
                      >
                        <Meta
                          title={
                            d.disease &&
                            d.primary_site && (
                              <Space>
                                <Text type="primary">{d.disease}</Text>
                                <Space>
                                  {d.primary_site && (
                                    <Text type="secondary">
                                      {snakeCaseToHumanReadable(d.primary_site)}
                                    </Text>
                                  )}
                                  {d.tumor_details && (
                                    <Text type="secondary">
                                      {snakeCaseToHumanReadable(
                                        d.tumor_details
                                      )}
                                    </Text>
                                  )}
                                </Space>
                              </Space>
                            )
                          }
                          description={
                            <Space
                              direction="vertical"
                              size={0}
                              style={{ display: "flex" }}
                            >
                              {generateCascaderOptions(d.tags).map((tag, i) => (
                                <div key={tag.value}>
                                  <Divider
                                    plain
                                    orientation="left"
                                    size="small"
                                  >
                                    {tag.label}
                                  </Divider>
                                  <Flex gap="2px" wrap="wrap">
                                    {tag.children.map((child) => (
                                      <Text key={child.value} code>
                                        {child.label}
                                      </Text>
                                    ))}
                                  </Flex>
                                </div>
                              ))}
                            </Space>
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
              </Col>
            </Row>

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
