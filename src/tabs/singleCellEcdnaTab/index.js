import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Card, Col, Empty, Row, Space, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import SingleCellWrapper from "../../components/singleCell/index.style";
import HelpDrawer from "../../components/singleCell/helpDrawer";
import ScEventModal from "../../components/singleCell/scEventModal";
import useWalks from "../../components/singleCell/ecdna/useWalks";
import WalkTable from "../../components/singleCell/ecdna/walkTable";
import WalkDiagram from "../../components/singleCell/ecdna/walkDiagram";
import WalkTreeBars from "../../components/singleCell/ecdna/walkTreeBars";
import WalkCooccurrence from "../../components/singleCell/ecdna/walkCooccurrence";
import useTreeView from "../../components/singleCell/useTreeView";

const { Text } = Typography;

/**
 * ecDNA / amplicon walks of the open patient: filterable table, the walk
 * drawn as a ring with its genes and junctions, copies of the selected walks
 * along the phylogeny, co-occurrence of walks in cells and CN vs CN.
 */
export default function SingleCellEcdnaTab() {
  const { t } = useTranslation("common");
  const { order } = useTreeView();
  const cellsAll = useSelector((s) => s.SingleCell.cells);
  const cellIds = useMemo(() => (order.length ? order : cellsAll.map((c) => c.cell_id)), [order, cellsAll]);
  const { status, all, filtered, filters, setFilters, colorOf, byId } = useWalks(cellIds);
  const [selected, setSelected] = useState([]);
  const [focus, setFocus] = useState(null);
  // default: the curated walks, else the top carriers
  useEffect(() => {
    if (!filtered.length) return;
    setSelected((prev) => {
      if (prev.length && prev.some((id) => filtered.some((w) => w.id === id))) return prev.filter((id) => filtered.some((w) => w.id === id));
      const curated = filtered.filter((w) => w.curated);
      return (curated.length ? curated : filtered.slice(0, 4)).map((w) => w.id);
    });
    setFocus((f) => (f && filtered.some((w) => w.id === f) ? f : filtered[0].id));
  }, [filtered]);
  const shown = selected.map((id) => filtered.find((w) => w.id === id) || byId.get(id)).filter(Boolean);
  if (status !== "ok" || !all.length) {
    return (
      <SingleCellWrapper>
        <Empty description={t("components.single-cell.ecdna.none")} />
      </SingleCellWrapper>
    );
  }
  return (
    <SingleCellWrapper>
      <ScEventModal />
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card size="small" title={<Space><BranchesOutlined />{t("components.single-cell.ecdna.title", { count: all.length })}</Space>} extra={<HelpDrawer />}>
            <WalkTable walks={filtered} total={all.length} filters={filters} setFilters={setFilters} colorOf={colorOf} selected={selected} onSelect={setSelected} focus={focus} onFocus={setFocus} nCells={cellIds.length} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <WalkDiagram walk={filtered.find((w) => w.id === focus) || byId.get(focus)} colorOf={colorOf} cellCount={cellIds.length} />
        </Col>
        <Col xs={24} xl={14}>
          <WalkTreeBars walks={shown} colorOf={colorOf} />
        </Col>
        <Col span={24}>
          <WalkCooccurrence walks={shown} cellIds={cellIds} colorOf={colorOf} />
        </Col>
        <Col span={24}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.ecdna.intro")}</Text>
        </Col>
      </Row>
    </SingleCellWrapper>
  );
}
