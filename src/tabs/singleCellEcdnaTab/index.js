import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Col, Collapse, Empty, Row, Segmented, Select, Slider, Space, Typography } from "antd";
import { BranchesOutlined, ClusterOutlined, NodeExpandOutlined } from "@ant-design/icons";
import SingleCellWrapper from "../../components/singleCell/index.style";
import HelpDrawer from "../../components/singleCell/helpDrawer";
import ScErrorBoundary from "../../components/singleCell/errorBoundary";
import ScEventModal from "../../components/singleCell/scEventModal";
import CellHeatmapPanel from "../../components/singleCell/cellHeatmapPanel";
import GenesPlot from "../../components/genesPlotHiglass";
import HoverLine from "../../components/hoverLine";
import useWalks from "../../components/singleCell/ecdna/useWalks";
import WalkPicker from "../../components/singleCell/ecdna/walkPicker";
import WalkTable from "../../components/singleCell/ecdna/walkTable";
import WalksPlot from "../../components/singleCell/ecdna/walksPlot";
import WalkDiagram from "../../components/singleCell/ecdna/walkDiagram";
import WalkContainmentCard from "../../components/singleCell/ecdna/walkContainmentCard";
import WalkTreeBars from "../../components/singleCell/ecdna/walkTreeBars";
import WalkCooccurrence from "../../components/singleCell/ecdna/walkCooccurrence";
import DisplayMenu from "../../components/singleCell/ecdna/displayMenu";
import singleCellActions from "../../redux/singleCell/actions";
import useTreeView from "../../components/singleCell/useTreeView";
import useContainerWidth from "../../components/singleCell/useContainerWidth";
import settingsActions from "../../redux/settings/actions";
import { toGlobal, walkFamilies, walkFootprint } from "../../helpers/singleCell/walks";
import { defaultFocusWalk } from "../../helpers/singleCell/walkPanels";
import { shortLabel } from "../../helpers/singleCell/walkPlotState";
import WalksLegend from "../../components/singleCell/ecdna/walksLegend";
import HintLine, { Provenance } from "../../components/singleCell/hintLine";
import { SC_GUTTER } from "../../components/singleCell/density";

const { Text } = Typography;
const PADS = [5e4, 1e5, 2.5e5, 5e5, 1e6, 2e6];
const padLabel = (p) => (p >= 1e6 ? `${p / 1e6} Mb` : `${p / 1e3} kb`);
const GENES_H = 76;

/** Padded, merged genomic domains covering the given walks (at most six panels). */
function walksDomains(walks, chromoBins, pad) {
  const ranges = walks
    .flatMap((w) => walkFootprint(w))
    .map((r) => ({ chromosome: r.chromosome, start: r.start - pad, end: r.end + pad }))
    .sort((a, b) => `${a.chromosome}`.localeCompare(`${b.chromosome}`, undefined, { numeric: true }) || a.start - b.start);
  const merged = [];
  ranges.forEach((r) => {
    const last = merged[merged.length - 1];
    if (last && last.chromosome === r.chromosome && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  });
  return merged
    .map((r) => {
      const bin = chromoBins?.[r.chromosome];
      if (!bin) return null;
      return [Math.max(bin.startPlace, Math.round(toGlobal(chromoBins, r.chromosome, r.start))), Math.min(bin.endPlace, Math.round(toGlobal(chromoBins, r.chromosome, r.end)))];
    })
    .filter((d) => d && d[1] > d[0])
    .slice(0, 6);
}

/**
 * ecDNA / amplicon walks of the open patient: pick walks (grouped into
 * families of nested variants), see them all at once as a PGV-style walk
 * plot with the genes track, aligned over the single-cell heatmap on the
 * same genomic axis; then their copies along the phylogeny, how they nest,
 * co-occurrence in cells and CN vs CN.
 */
export default function SingleCellEcdnaTab() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { order } = useTreeView();
  const cellsAll = useSelector((s) => s.SingleCell.cells);
  const patient = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const insets = useSelector((s) => s.SingleCell.plotInsets);
  // nesting / co-occurrence / copies-vs-copies: folded away until the user opens them (remembered)
  const relationsOpen = useSelector((s) => !!s.SingleCell.layout?.walkRelationsOpen);
  const { chromoBins, domains } = useSelector((s) => s.Settings);
  const genesList = useSelector((s) => s.Genes?.list || []);
  const cellIds = useMemo(() => (order.length ? order : cellsAll.map((c) => c.cell_id)), [order, cellsAll]);
  const { status, all, measured, filtered, filters, setFilters, colorOf, byId, idMatch } = useWalks(cellIds);
  const [selected, setSelected] = useState([]);
  const [focus, setFocus] = useState(null);
  const [pad, setPad] = useState(2.5e5);
  const [colorBy, setColorBy] = useState("walk");
  const [laneHeight, setLaneHeight] = useState(18);
  const [showTable, setShowTable] = useState(false);
  const [chipHover, setChipHover] = useState(null); // walk hovered among the chips, marked in the plot
  const [genesRef, genesWidth] = useContainerWidth(1200);

  const families = useMemo(() => walkFamilies(filtered), [filtered]);
  useEffect(() => {
    if (!filtered.length) return;
    setSelected((prev) => {
      const kept = prev.filter((id) => filtered.some((w) => w.id === id));
      if (kept.length) return kept;
      // default: every walk in a family that holds a curated walk (the species and its variants)
      const fams = walkFamilies(filtered).filter((fam) => fam.some((w) => w.curated));
      const pick = fams.length ? fams.flat() : filtered.slice(0, 6);
      return pick.slice(0, 24).map((w) => w.id);
    });
    setFocus((f) => (f && filtered.some((w) => w.id === f) ? f : null));
  }, [filtered]);
  const shown = useMemo(() => selected.map((id) => filtered.find((w) => w.id === id) || byId.get(id)).filter(Boolean), [selected, filtered, byId]);
  const shownFamilies = useMemo(() => walkFamilies(shown), [shown]);
  // the highlight only applies to a drawn walk: unticking (or filtering out) the highlighted walk clears it,
  // otherwise every lane would stay faded with nothing highlighted
  const activeFocus = focus && shown.some((w) => w.id === focus) ? focus : null;
  useEffect(() => {
    if (focus && !activeFocus) setFocus(null);
  }, [focus, activeFocus]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setFocus(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // the heatmap takes no props: keep its element stable so hovering chips / lanes never re-renders it
  const heatmap = useMemo(() => <CellHeatmapPanel />, []);

  // open on the ticked walks' regions once per patient; afterwards the view is the user's
  const zoomedFor = useRef(null);
  const zoomToShown = (ws = shown) => {
    const ds = walksDomains(ws, chromoBins, pad);
    if (ds.length) dispatch(settingsActions.updateDomains(ds));
  };
  useEffect(() => {
    if (!shown.length || !chromoBins || zoomedFor.current === patient) return;
    zoomedFor.current = patient;
    zoomToShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.length, chromoBins, patient]);

  if (status !== "ok" || !all.length) {
    return (
      <SingleCellWrapper>
        <Empty description={t("components.single-cell.ecdna.none")} />
      </SingleCellWrapper>
    );
  }
  const labelWidth = insets?.left > 120 ? insets.left : 300;
  const rightWidth = insets?.right > 0 ? insets.right : 60;
  // default single-walk card: the shown walk with the most carrier cells, not a one-cell variant
  const focused = (activeFocus && (filtered.find((w) => w.id === activeFocus) || byId.get(activeFocus))) || defaultFocusWalk(shown, cellIds);
  return (
    <SingleCellWrapper>
      <ScEventModal />
      <ScErrorBoundary resetKey={`${selected.join("|")}-${activeFocus}`} title="ecDNA view failed">
        <Row gutter={SC_GUTTER}>
          <Col span={24}>
            <Card size="small" title={<Space><BranchesOutlined />{t("components.single-cell.ecdna.title", { count: all.length })}<Provenance id="walks" /></Space>} extra={<HelpDrawer />}>
              {idMatch.listed > 0 && idMatch.matched === 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 10 }}
                  message={t("components.single-cell.ecdna.id-mismatch", { count: idMatch.listed, example: idMatch.example, cell: cellIds[0] })}
                />
              )}
              <WalkPicker families={families} total={all.length} nCells={cellIds.length} filters={filters} setFilters={setFilters} colorOf={colorOf} selected={selected} onSelect={setSelected} onShowTable={() => setShowTable((v) => !v)} tableOpen={showTable} focus={activeFocus} onHover={setChipHover} />
              {showTable && (
                <div style={{ marginTop: 10 }}>
                  <WalkTable walks={filtered} total={all.length} filters={filters} setFilters={setFilters} colorOf={colorOf} selected={selected} onSelect={setSelected} focus={activeFocus} onFocus={(id) => { setSelected((prev) => (prev.includes(id) ? prev : [...prev, id])); setFocus(id); }} nCells={cellIds.length} />
                </div>
              )}
            </Card>
          </Col>
          <Col span={24}>
            <Card
              size="small"
              title={<Space size={6}><NodeExpandOutlined />{t("components.single-cell.ecdna.plot-title", { count: shown.length })}<HintLine inline provenance="walks" text={t("components.single-cell.ecdna.plot-help")} /></Space>}
              extra={
                <Space wrap>
                  <DisplayMenu
                    rows={[
                      { label: t("components.single-cell.ecdna.display-colour"), control: <Segmented size="small" value={colorBy} onChange={setColorBy} options={[{ value: "walk", label: t("components.single-cell.ecdna.color-walk") }, { value: "chromosome", label: t("components.single-cell.ecdna.color-chr") }]} /> },
                      { label: t("components.single-cell.ecdna.lane"), control: <Slider min={12} max={40} value={laneHeight} onChange={setLaneHeight} style={{ width: 140, margin: "0 6px" }} /> },
                      { label: t("components.single-cell.ecdna.heat-pad"), control: <Select size="small" value={pad} onChange={setPad} style={{ width: 86 }} options={PADS.map((p) => ({ value: p, label: padLabel(p) }))} /> },
                    ]}
                  />
                  <Button size="small" type="primary" ghost onClick={() => zoomToShown()} disabled={!shown.length}>{t("components.single-cell.ecdna.zoom-shown")}</Button>
                  {activeFocus && focused && <Button size="small" onClick={() => zoomToShown([focused])}>{t("components.single-cell.ecdna.zoom-focus", { label: shortLabel(focused.label, 18) })}</Button>}
                  {activeFocus && <Button size="small" type="text" onClick={() => setFocus(null)}>{t("components.single-cell.ecdna.clear-focus")}</Button>}
                </Space>
              }
            >
              <WalksPlot walks={shown} families={shownFamilies} colorOf={colorOf} focus={activeFocus} hover={chipHover} onFocus={(id) => setFocus((f) => (f === id ? null : id))} labelWidth={labelWidth} rightWidth={rightWidth} laneHeight={laneHeight} colorBy={colorBy} />
              <div ref={genesRef} style={{ position: "relative", marginLeft: labelWidth, marginRight: rightWidth, height: shown.length ? GENES_H : 0, marginTop: 4, overflow: "hidden" }}>
                {shown.length > 0 && genesList.length > 0 && domains?.length > 0 && genesWidth > 200 && (
                  <>
                    <GenesPlot {...{ width: genesWidth, height: GENES_H, domains, genesList }} />
                    <HoverLine width={genesWidth} height={GENES_H} margins={{ gapX: 50, gapY: 0, gapYUnits: 2 }} />
                  </>
                )}
              </div>
              <WalksLegend />
            </Card>
            {heatmap}
          </Col>
          <Col span={24}>
            <WalkTreeBars walks={shown} families={shownFamilies} colorOf={colorOf} measured={measured} focus={activeFocus} />
          </Col>
          <Col span={24}>
            <WalkDiagram walk={focused} colorOf={colorOf} cellIds={cellIds} />
          </Col>
          <Col span={24}>
            <Collapse
              className="sc-walk-relations"
              activeKey={relationsOpen ? ["rel"] : []}
              onChange={(keys) => dispatch(singleCellActions.updateLayout({ walkRelationsOpen: keys.length > 0 }))}
              items={[
                {
                  key: "rel",
                  label: <Space size={6}><ClusterOutlined />{t("components.single-cell.ecdna.relations-title")}<Text type="secondary">{t("components.single-cell.ecdna.relations-sub", { count: shown.length })}</Text></Space>,
                  children: relationsOpen && (
                    <Row gutter={SC_GUTTER}>
                      <Col span={24}>
                        <WalkContainmentCard walks={shown} colorOf={colorOf} cellIds={cellIds} focus={activeFocus} onFocus={(id) => setFocus((f) => (f === id ? null : id))} />
                      </Col>
                      <Col span={24}>
                        <WalkCooccurrence walks={shown} families={shownFamilies} cellIds={cellIds} colorOf={colorOf} minCn={filters.minCn} />
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />
          </Col>
        </Row>
      </ScErrorBoundary>
    </SingleCellWrapper>
  );
}
