import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Card, Col, Empty, Row, Select, Space, Typography } from "antd";
import { BranchesOutlined, LineOutlined } from "@ant-design/icons";
import SingleCellWrapper from "../../components/singleCell/index.style";
import HelpDrawer from "../../components/singleCell/helpDrawer";
import ScEventModal from "../../components/singleCell/scEventModal";
import CellHeatmapPanel from "../../components/singleCell/cellHeatmapPanel";
import useWalks from "../../components/singleCell/ecdna/useWalks";
import WalkTable from "../../components/singleCell/ecdna/walkTable";
import WalkDiagram from "../../components/singleCell/ecdna/walkDiagram";
import WalksTrack from "../../components/singleCell/ecdna/walksTrack";
import WalkContainmentCard from "../../components/singleCell/ecdna/walkContainmentCard";
import WalkTreeBars from "../../components/singleCell/ecdna/walkTreeBars";
import WalkCooccurrence from "../../components/singleCell/ecdna/walkCooccurrence";
import useTreeView from "../../components/singleCell/useTreeView";
import settingsActions from "../../redux/settings/actions";
import { toGlobal, walkFootprint } from "../../helpers/singleCell/walks";

const { Text } = Typography;
const PADS = [1e5, 2.5e5, 5e5, 1e6, 2e6, 5e6];
const padLabel = (p) => (p >= 1e6 ? `${p / 1e6} Mb` : `${p / 1e3} kb`);

/**
 * ecDNA / amplicon walks of the open patient: filterable table; the ticked
 * walks as a genome track over the single-cell heatmap (zoomed to their
 * regions); one walk's ring; how the walks nest; their copies along the
 * phylogeny; co-occurrence and CN vs CN.
 */
export default function SingleCellEcdnaTab() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { order } = useTreeView();
  const cellsAll = useSelector((s) => s.SingleCell.cells);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const cellIds = useMemo(() => (order.length ? order : cellsAll.map((c) => c.cell_id)), [order, cellsAll]);
  const { status, all, filtered, filters, setFilters, colorOf, byId } = useWalks(cellIds);
  const [selected, setSelected] = useState([]);
  const [focus, setFocus] = useState(null);
  const [pad, setPad] = useState(5e5);
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
  // zoom the shared genome view to the ticked walks' regions (merged per chromosome, padded)
  const domainKey = shown.map((w) => w.id).join("|") + `|${pad}`;
  useEffect(() => {
    if (!shown.length || !chromoBins) return;
    const ranges = [];
    shown.forEach((w) => walkFootprint(w).forEach((r) => ranges.push(r)));
    const merged = [];
    ranges
      .map((r) => ({ chromosome: r.chromosome, start: r.start - pad, end: r.end + pad }))
      .sort((a, b) => `${a.chromosome}`.localeCompare(`${b.chromosome}`, undefined, { numeric: true }) || a.start - b.start)
      .forEach((r) => {
        const last = merged[merged.length - 1];
        if (last && last.chromosome === r.chromosome && r.start <= last.end) last.end = Math.max(last.end, r.end);
        else merged.push({ ...r });
      });
    const domains = merged
      .map((r) => {
        const bin = chromoBins[r.chromosome];
        if (!bin) return null;
        return [Math.max(bin.startPlace, toGlobal(chromoBins, r.chromosome, r.start)), Math.min(bin.endPlace, toGlobal(chromoBins, r.chromosome, r.end))];
      })
      .filter((d) => d && d[1] > d[0])
      .slice(0, 6);
    if (domains.length) dispatch(settingsActions.updateDomains(domains));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainKey, chromoBins]);
  if (status !== "ok" || !all.length) {
    return (
      <SingleCellWrapper>
        <Empty description={t("components.single-cell.ecdna.none")} />
      </SingleCellWrapper>
    );
  }
  const focused = filtered.find((w) => w.id === focus) || byId.get(focus);
  return (
    <SingleCellWrapper>
      <ScEventModal />
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card size="small" title={<Space><BranchesOutlined />{t("components.single-cell.ecdna.title", { count: all.length })}</Space>} extra={<HelpDrawer />}>
            <WalkTable walks={filtered} total={all.length} filters={filters} setFilters={setFilters} colorOf={colorOf} selected={selected} onSelect={setSelected} focus={focus} onFocus={setFocus} nCells={cellIds.length} />
          </Card>
        </Col>
        <Col span={24}>
          <Card
            size="small"
            title={<Space><LineOutlined />{t("components.single-cell.ecdna.track-title", { count: shown.length })}</Space>}
            extra={<Space><Text type="secondary">{t("components.single-cell.ecdna.heat-pad")}</Text><Select size="small" value={pad} onChange={setPad} style={{ width: 90 }} options={PADS.map((p) => ({ value: p, label: padLabel(p) }))} /></Space>}
            bodyStyle={{ padding: "8px 0 0 0" }}
          >
            <WalksTrack walks={shown} colorOf={colorOf} focus={focus} onFocus={setFocus} />
            <Text type="secondary" style={{ fontSize: 12, padding: "0 12px", display: "block" }}>{t("components.single-cell.ecdna.track-help")}</Text>
          </Card>
          <CellHeatmapPanel />
        </Col>
        <Col xs={24} xl={9}>
          <WalkDiagram walk={focused} colorOf={colorOf} cellCount={cellIds.length} />
        </Col>
        <Col xs={24} xl={15}>
          <WalkContainmentCard walks={shown} colorOf={colorOf} />
        </Col>
        <Col span={24}>
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
