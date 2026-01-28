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
  InputNumber,
  Slider,
  Collapse,
  Tag,
  Tabs,
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
import ContainerDimensions from "react-container-dimensions";
import InterpretationsAvatar from "../../components/interpretationsAvatar";
import AggregationsPanel from "./aggregationsPanel";
import CohortsPanel from "./cohortsPanel";
import HistogramPlot from "../../components/histogramPlot";

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
    activeTab: "cases",
  };

  renderCascaderOption = (option) => {
    const { t } = this.props;
    const labelText =
      typeof option?.label === "string" || typeof option?.label === "number"
        ? option.label
        : undefined;
    return (
      <div className="filter-option-container">
        <span className="filter-option-text" title={labelText}>
          {option?.label}
        </span>
        {option?.count != null && option?.children == null && (
          <span className="filter-option-count">
            {t("containers.list-view.filters.case", {
              count: option?.count,
            })}
          </span>
        )}
      </div>
    );
  };

  renderSelectOption = (option) => {
    const { t } = this.props;
    const { label, count } = option.data || {};
    return (
      <div className="filter-option-container">
        <span className="filter-option-text" title={label}>
          {label}
        </span>
        {count != null && (
          <span className="filter-option-count">
            {t("containers.list-view.filters.case", {
              count,
            })}
          </span>
        )}
      </div>
    );
  };

  handleTabChange = (key) => {
    this.setState({ activeTab: key });
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
          acc["operator"] = cascaderOperators[0];
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
      casesWithInterpretations,
      interpretationsCounts,
      datafiles,
      dataset,
      plots,
    } = this.props;

    const initialValues = {
      ...searchFilters,
    };

    let filterFormItemRenderer = (d) => {
      if (d.filter.renderer === "cascader") {
        return (
          <Compact block className="tags-container">
            <Item
              key={`containers.list-view.filters.${d.filter.name}-operator`}
              className="tags-operator-item"
              name={
                d.filter.external ? `${d.filter.name}-operator` : `operator`
              }
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
                options={
                  d.options || generateCascaderOptions(d.records, d.frequencies)
                }
                displayRender={this.tagsDisplayRender}
                optionRender={this.renderCascaderOption}
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
        d.records &&
        d.records.length > 0 &&
        !d.records.every((e) => e == null)
      ) {
        return (
          <Item
            key={d.filter.name}
            name={d.filter.name}
            label={d.filter.title}
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
              optionRender={this.renderSelectOption}
            />
          </Item>
        );
      }

      if (
        d.filter.renderer === "slider" &&
        filtersExtents[d.filter.name] &&
        !isNaN(filtersExtents[d.filter.name]?.[0]) &&
        !isNaN(filtersExtents[d.filter.name]?.[1])
      ) {
        let plot = plots.find((p) => p.id === d.filter.name);
        return (
          <Item
            key={`containers.list-view.filters.${d.filter.name}`}
            label={t(
              `containers.list-view.filters.${d.filter.name}`,
              d.filter.title || d.filter.name
            )}
          >
            <Space direction="vertical" className="filter-slider-space">
              <div style={{ width: "100%", height: 120 }}>
                <ContainerDimensions>
                  {({ width, height }) => {
                    return (
                      plot && (
                        <div style={{ width: width, height: 120 }}>
                          <HistogramPlot
                            {...{
                              id: plot.id,
                              data: plot.data,
                              dataset: plot.dataset,
                              q1: plot.q1,
                              q3: plot.q3,
                              q99: plot.q99,
                              scaleX: plot.scaleX,
                              bandwidth: plot.bandwidth,
                              format: plot.format,
                              niceX: false,
                              range: filtersExtents[d.filter.name],
                              width: width,
                              height: 100,
                              margins: {
                                gapX: 10,
                                gapY: 12,
                                gap: 0,
                                yTicksCount: 10,
                                xTicksCount: 5,
                              },
                            }}
                          />
                        </div>
                      )
                    );
                  }}
                </ContainerDimensions>
              </div>
              <Item
                name={d.filter.name}
                noStyle
                initialValue={[
                  +filtersExtents[d.filter.name]?.[0],
                  +filtersExtents[d.filter.name]?.[1],
                ]}
              >
                <Slider
                  range
                  min={+filtersExtents[d.filter.name]?.[0]}
                  max={+filtersExtents[d.filter.name]?.[1]}
                  step={
                    (filtersExtents[d.filter.name]?.[1] -
                      filtersExtents[d.filter.name]?.[0]) /
                    100
                  }
                  marks={{
                    [+filtersExtents[d.filter.name]?.[0]]: d3.format(d.format)(
                      filtersExtents[d.filter.name]?.[0]
                    ),
                    [+filtersExtents[d.filter.name]?.[1]]: d3.format(d.format)(
                      filtersExtents[d.filter.name]?.[1]
                    ),
                  }}
                  tooltip={{
                    formatter: (value) => d3.format(d.format)(value),
                  }}
                />
              </Item>
              <Item
                noStyle
                shouldUpdate={(prev, cur) =>
                  prev?.[d.filter.name]?.toString() !==
                  cur?.[d.filter.name]?.toString()
                }
              >
                {({ getFieldValue, setFieldsValue }) => {
                  const current = getFieldValue(d.filter.name) || [];
                  const [currentMin, currentMax] = current;
                  const updateValue = (nextMin, nextMax) => {
                    const minValue =
                      nextMin ?? filtersExtents[d.filter.name]?.[0];
                    const maxValue =
                      nextMax ?? filtersExtents[d.filter.name]?.[1];
                    setFieldsValue({
                      [d.filter.name]: [minValue, maxValue],
                    });
                    // Trigger search just like the slider change does
                    this.onValuesChange({
                      [d.filter.name]: [minValue, maxValue],
                    });
                  };
                  const step =
                    (filtersExtents[d.filter.name]?.[1] -
                      filtersExtents[d.filter.name]?.[0]) /
                    100;
                  return (
                    <div className="filter-slider-inputs">
                      <div className="filter-slider-input">
                        <Text className="filter-slider-input-label">
                          {t("containers.list-view.filters.slider.min")}
                        </Text>
                        <InputNumber
                          size="small"
                          value={currentMin}
                          min={+filtersExtents[d.filter.name]?.[0]}
                          max={currentMax}
                          step={step}
                          precision={2}
                          onChange={(value) => updateValue(value, currentMax)}
                        />
                      </div>
                      <div className="filter-slider-input">
                        <Text className="filter-slider-input-label align-right">
                          {t("containers.list-view.filters.slider.max")}
                        </Text>
                        <InputNumber
                          size="small"
                          value={currentMax}
                          min={currentMin}
                          max={+filtersExtents[d.filter.name]?.[1]}
                          step={step}
                          precision={2}
                          onChange={(value) => updateValue(currentMin, value)}
                        />
                      </div>
                    </div>
                  );
                }}
              </Item>
            </Space>
          </Item>
        );
      }
      return null; // nothing for unknown renderer
    };

    return (
      <Wrapper>
        <Form
          layout="vertical"
          initialValues={initialValues}
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
                    defaultActiveKey={"general"}
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
                          label: filteredGroups[0]?.filter?.groupTitle,
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
                <Tabs
                  activeKey={this.state.activeTab}
                  onChange={this.handleTabChange}
                  items={[
                    {
                      key: "cases",
                      label: t("containers.list-view.tabs.cases"),
                      children: (
                        <>
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
                                          __html: t(
                                            "containers.list-view.ordering",
                                            {
                                              attribute: t(
                                                `components.header-panel.metadata.${d.attribute}.short`
                                              ),
                                              sort: d.sort,
                                            }
                                          ),
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
                                      <Text type="secondary">
                                        {d.inferred_sex}
                                      </Text>
                                      {d.qcEvaluation && (
                                        <Tag
                                          color={
                                            qcMetricsClasses[
                                              d.qcEvaluation.toLowerCase()
                                            ]
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
                                    <Space>
                                      <InterpretationsAvatar
                                        pair={d.pair}
                                        casesWithInterpretations={
                                          casesWithInterpretations
                                        }
                                        interpretationsCounts={
                                          interpretationsCounts
                                        }
                                      />
                                      {d.tumor_type ? (
                                        <Avatar
                                          style={{
                                            backgroundColor: "#fde3cf",
                                            color: "#f56a00",
                                          }}
                                        >
                                          {d.tumor_type}
                                        </Avatar>
                                      ) : null}
                                    </Space>
                                  }
                                  actions={[
                                    <Statistic
                                      className="stats"
                                      title={t(
                                        `components.header-panel.metadata.sv_count.short`
                                      )}
                                      value={
                                        d.sv_count != null
                                          ? d3.format(",")(d.sv_count)
                                          : t("general.not-applicable")
                                      }
                                    />,
                                    <Statistic
                                      className="stats"
                                      title={t(
                                        `components.header-panel.metadata.tmb.short`
                                      )}
                                      value={
                                        d.tmb != null
                                          ? d3.format(",")(d.tmb)
                                          : t("general.not-applicable")
                                      }
                                    />,
                                    <Statistic
                                      className="stats"
                                      title={t(
                                        `components.header-panel.metadata.tumor_median_coverage.shorter`
                                      )}
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
                                      title={t(
                                        "components.header-panel.purity-ploidy-title"
                                      )}
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
                                          <Text type="primary">
                                            {d.disease}
                                          </Text>
                                          {d.primary_site && (
                                            <Text type="secondary">
                                              <br />
                                              {snakeCaseToHumanReadable(
                                                d.primary_site
                                              )}
                                            </Text>
                                          )}
                                          {d.tumor_details && (
                                            <Text type="secondary">
                                              <br />
                                              {snakeCaseToHumanReadable(
                                                d.tumor_details
                                              )}
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
                                        {generateCascaderOptions(
                                          d.visibleTags
                                        ).map((tag, i) => (
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
                            <Row
                              className="results-bottom-box"
                              gutter={[16, 16]}
                            >
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
                            <Card>
                              <Empty
                                description={t("containers.list-view.no_data")}
                              />
                            </Card>
                          )}
                        </>
                      ),
                    },
                    {
                      key: "aggregations",
                      label: t("containers.list-view.tabs.aggregations"),
                      children: (
                        <AggregationsPanel
                          datafiles={datafiles}
                          searchFilters={searchFilters}
                          dataset={dataset}
                        />
                      ),
                    },
                    {
                      key: "cohorts",
                      label: t("containers.list-view.tabs.cohorts"),
                      children: <CohortsPanel />,
                    },
                  ]}
                />
              </Col>
            </Row>
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
const mapStateToProps = (state) => ({
  casesWithInterpretations: state.CaseReports.casesWithInterpretations,
  interpretationsCounts: state.CaseReports.interpretationsCounts,
  plots: state.PopulationStatistics.cohort,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ListView));
