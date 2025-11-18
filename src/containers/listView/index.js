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
  Tag,
} from "antd";
import * as d3 from "d3";
import {
  snakeCaseToHumanReadable,
  orderListViewFilters,
} from "../../helpers/utility";
import { qcMetricsClasses } from "../../helpers/metadata";
import {
  generateCascaderOptions,
  cascaderOperators,
  cascaderSearchFilter,
} from "../../helpers/filters";
import Wrapper from "./index.style";

const { SHOW_CHILD } = Cascader;

const { Meta } = Card;
const { Option } = Select;
const { Text, Paragraph } = Typography;
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
    const { filters, filtersExtents } = this.props;
    // Build reset values: sliders use their extent, others empty array
    const resetValues = filters.reduce((acc, d) => {
      const name = d.filter.name;
      if (d.filter.renderer === "slider") {
        acc[name] = filtersExtents[name];
      } else {
        acc[name] = [];
      }
      // Set default operator for cascader filters
      if (d.filter.renderer === "cascader") {
        if (d.filter.external) {
          acc[`${name}-operator`] = cascaderOperators[0];
        } else {
          acc['operator'] = cascaderOperators[0];
        }
      }
      return acc;
    }, {});
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
      filtersExtents,
      totalRecords,
    } = this.props;

    let filterFormItemRenderer = (d) => {
      if (d.filter.renderer === "cascader") {
        return (
          <Compact block className="tags-container">
            <Item
              key={`containers.list-view.filters.${d.filter.name}-operator`}
              className="tags-operator-item"
              name={d.filter.external ? `${d.filter.name}-operator` : `operator`}
              label={t(
                `containers.list-view.filters.${d.filter.name}-operator`
              )}
              initialValue={cascaderOperators[0]}
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
                options={d.options || generateCascaderOptions(d.records, d.frequencies)}
                displayRender={this.tagsDisplayRender}
                optionRender={(option) => {
                  return (
                    <div className="filter-option-container">
                      <span>
                        <Text
                          className="filter-option-text"
                          ellipsis={{ tooltip: option?.label }}
                        >
                          {option?.label}
                        </Text>
                      </span>
                      {option?.count != null && (
                        <span className="filter-option-count">
                          {option?.children == null &&
                            t("containers.list-view.filters.case", {
                              count: option?.count,
                            })}
                        </span>
                      )}
                    </div>
                  );
                }}
                multiple
                showSearch={{
                  // PERFORMANCE OPTIMIZATION 1: Limit search results to 50 items
                  // This prevents the UI from trying to render thousands of search results
                  // which would cause the browser to become unresponsive
                  limit: 50,
                  filter: cascaderSearchFilter,
                  matchInputWidth: false,
                }}
                maxTagCount="responsive"
                showCheckedStrategy={SHOW_CHILD}
                allowClear
              />
            </Item>
          </Compact>
        );
      }

      if (
        d.filter.renderer === "select" &&
        d.records.length > 0 &&
        !d.records.every((e) => e == null)
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
          >
            <Select
              placeholder={t("containers.list-view.filters.placeholder")}
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              maxTagCount="responsive"
              maxTagTextLength={8}
              options={d.records.map((e) => ({
                label: e
                  ? snakeCaseToHumanReadable(e)
                  : t("containers.list-view.filters.empty"),
                value: e || "null",
                count: d.frequencies[e] || 0,
              }))}
              labelInValue={false}
              optionRender={(option) => (
                <div className="filter-option-container">
                  <span>
                    <Text
                      className="filter-option-text"
                      ellipsis={{ tooltip: option.data.label }}
                    >
                      {option.data.label}
                    </Text>
                  </span>
                  {option.data.count != null && (
                    <span className="filter-option-count">
                      {t("containers.list-view.filters.case", {
                        count: option.data.count,
                      })}
                    </span>
                  )}
                </div>
              )}
            />
          </Item>
        );
      }

      if (
        d.filter.renderer === "slider" &&
        !isNaN(filtersExtents[d.filter.name]?.[0]) &&
        !isNaN(filtersExtents[d.filter.name]?.[1])
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
            initialValue={filtersExtents[d.filter.name]}
          >
            <Slider
              range
              min={filtersExtents[d.filter.name]?.[0]}
              max={filtersExtents[d.filter.name]?.[1]}
              step={
                (filtersExtents[d.filter.name]?.[1] -
                  filtersExtents[d.filter.name]?.[0]) /
                100
              }
              marks={{
                [filtersExtents[d.filter.name]?.[0]]: d3.format(d.format)(
                  filtersExtents[d.filter.name]?.[0]
                ),
                [filtersExtents[d.filter.name]?.[1]]: d3.format(d.format)(
                  filtersExtents[d.filter.name]?.[1]
                ),
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
                      .filter(
                        ([group, groupedItems]) =>
                          !groupedItems
                            .map((d) => d.records || d.options)
                            .flat()
                            .every((e) => e == null)
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
                            <Text
                              strong
                              ellipsis={{ tooltip: d.pair }}
                              className="case-report-ellipsis-text"
                            >
                              {d.pair}
                            </Text>
                            <Text type="secondary">{d.inferred_sex}</Text>
                            {d.qcEvaluation && (
                              <Tag
                                color={
                                  qcMetricsClasses[d.qcEvaluation.toLowerCase()]
                                }
                                className="qc-evaluation-tag"
                              >
                                {d.qcEvaluation}
                              </Tag>
                            )}
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
                              <Paragraph>
                                <Text type="primary">{d.disease}</Text>
                                {d.primary_site && (
                                  <Text type="secondary">
                                    <br />
                                    {snakeCaseToHumanReadable(d.primary_site)}
                                  </Text>
                                )}
                                {d.tumor_details && (
                                  <Text type="secondary">
                                    <br />
                                    {snakeCaseToHumanReadable(d.tumor_details)}
                                  </Text>
                                )}
                              </Paragraph>
                            )
                          }
                          description={
                            <Space
                              direction="vertical"
                              size={0}
                              style={{ display: "flex" }}
                            >
                              {generateCascaderOptions(d.tags).map((tag, i) => (
                                <div key={`tag-${tag.value}-${i}`}>
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
  filtersExtents: {},
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ListView));
