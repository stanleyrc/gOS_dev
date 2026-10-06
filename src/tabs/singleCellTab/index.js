import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Affix, Alert, Col, Empty, Progress, Row, Space, Switch, Typography } from "antd";
import CellHeatmapPanel from "../../components/singleCell/cellHeatmapPanel";
import CellIgvPanel from "../../components/singleCell/cellIgvPanel";
import UmapPanel from "../../components/singleCell/umapPanel";
import CellSelectionPanel from "../../components/singleCell/cellSelectionPanel";
import CellTracksPanel from "../../components/singleCell/cellTracksPanel";
import TracksLegendPanel from "../../components/tracksLegendPanel";
import singleCellActions from "../../redux/singleCell/actions";
import HeightHandle from "../../components/singleCell/heightHandle";
import SingleCellWrapper from "../../components/singleCell/index.style";
import Wrapper from "./index.style";

const { Text } = Typography;

/**
 * Height of what stays pinned above the navigation: the case header plus the
 * sticky tab bar (both vary by case and while scrolling).
 */
function usePinnedHeaderHeight(fallback = 144) {
  const [height, setHeight] = useState(fallback);
  useEffect(() => {
    const header = document.querySelector(".ant-home-header-container");
    const tabs = document.querySelector(".ant-home-content-container > .ant-tabs > .ant-tabs-nav");
    if (!header) return undefined;
    const measure = () =>
      setHeight(
        Math.round(header.getBoundingClientRect().height + (tabs ? tabs.getBoundingClientRect().height : 0)) || fallback
      );
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    if (tabs) observer.observe(tabs);
    return () => observer.disconnect();
  }, [fallback]);
  return height;
}

/** Patient-level single-cell view: phylogeny, heatmaps, reads, and per-cell tracks. */
export default function SingleCellTab() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { loading, loadingPercentage, error, missing, cells, layout, plotInsets, rna } = useSelector(
    (state) => state.SingleCell
  );
  const chromoBins = useSelector((state) => state.Settings.chromoBins);
  const genes = useSelector((state) => state.Genes);
  const [yScaleMode, setYScaleMode] = useState("common");
  const [pinned, setPinned] = useState(false);
  const [dragNav, setDragNav] = useState(null);
  const headerHeight = usePinnedHeaderHeight();
  // Height of the navigation as currently drawn (compact while pinned): the
  // heatmap toolbar sticks just below it.
  const navRef = useRef(null);
  const [navHeight, setNavHeight] = useState(0);
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setNavHeight(Math.round(el.getBoundingClientRect().height)));
    observer.observe(el);
    return () => observer.disconnect();
  });

  if (loading) {
    return (
      <Wrapper>
        <Space direction="vertical" align="center" className="sc-tab-loading">
          <Progress type="circle" percent={loadingPercentage} size={72} />
          <Text type="secondary">{t("components.single-cell.loading")}</Text>
        </Space>
      </Wrapper>
    );
  }
  if (error) {
    return (
      <Wrapper>
        <Alert
          type="error"
          showIcon
          message={t("components.single-cell.errors.load")}
          description={error.message}
        />
      </Wrapper>
    );
  }
  if (missing) return null;
  if (!cells.length) {
    return (
      <Wrapper>
        <Empty description={t("components.single-cell.no-cells")} />
      </Wrapper>
    );
  }

  const toggle = (key) => (checked) => dispatch(singleCellActions.updateLayout({ [key]: checked }));

  return (
    <Wrapper style={{ "--sc-sticky-top": `${headerHeight + (pinned ? navHeight : 0)}px` }}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Space wrap size={[16, 4]} className="sc-tab-toggles">
            {rna.status === "ok" && (
              <Space size={6}>
                <Switch size="small" checked={layout.showUmap} onChange={toggle("showUmap")} />
                <Text>{t("components.single-cell.toggles.umap")}</Text>
              </Space>
            )}
            <Space size={6}>
              <Switch size="small" checked={layout.showCellTable} onChange={toggle("showCellTable")} />
              <Text>{t("components.single-cell.toggles.cell-table")}</Text>
            </Space>
          </Space>
        </Col>
        <Col span={24}>
          {/* Same navigation as the Genome View (chromosome brush strip for one or
              more side-by-side regions, location box, gene search), padded so
              its genome plots line up with the heatmap's genomic columns. While
              pinned during scrolling it shrinks to the plots alone. */}
          <div className="sc-nav-affix">
          <Affix offsetTop={headerHeight} onChange={(affixed) => setPinned(Boolean(affixed))}>
            <div ref={navRef}>
            <TracksLegendPanel
              {...{
                loading: genes.loading,
                genesList: genes.list,
                error: genes.error,
                chromoBins,
                visible: true,
                handleYscaleModeChange: setYScaleMode,
                yScaleMode,
                compact: pinned,
                plotInsets,
                plotHeight: dragNav ?? layout.navHeight,
              }}
            />
            </div>
          </Affix>
          </div>
          <SingleCellWrapper>
            <HeightHandle
              title={t("components.single-cell.heatmap.resize-genes")}
              onResize={(dy) => setDragNav(Math.max(140, Math.min(800, layout.navHeight + dy)))}
              onCommit={(dy) => {
                dispatch(singleCellActions.updateLayout({ navHeight: Math.max(140, Math.min(800, layout.navHeight + dy)) }));
                setDragNav(null);
              }}
              onReset={() => dispatch(singleCellActions.updateLayout({ navHeight: 240 }))}
            />
          </SingleCellWrapper>
        </Col>
        <Col span={24}>
          <CellHeatmapPanel />
        </Col>
        <Col span={24}>
          <CellIgvPanel />
        </Col>
        {layout.showUmap && rna.status === "ok" && (
          <Col span={24}>
            <UmapPanel />
          </Col>
        )}
        {layout.showCellTable && (
          <Col span={24}>
            <CellSelectionPanel />
          </Col>
        )}
        <Col span={24}>
          <CellTracksPanel yScaleMode={yScaleMode} />
        </Col>
      </Row>
    </Wrapper>
  );
}
