import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Card, Col, Row, Select, Space, Typography } from "antd";
import { GiHistogram } from "react-icons/gi";
import BinPlot from "../../components/binPlot";
import CopyStateFitControls from "../../components/purityPloidySlider/copyStateFitControls";
import BinPlotWrapper from "../../components/binPlotPanel/index.style";
import Wrapper from "../binQCTab/index.style";
import useContainerWidth from "../../components/singleCell/useContainerWidth";
import usePatientClades from "../../components/singleCell/usePatientClades";
import { useFitData, MAX_POOLED } from "../../components/singleCell/ppfit/useFitData";
import { FitCurve, MafPlot, PloidyStrip } from "../../components/singleCell/ppfit/fitPlots";
import {
  applyPreviewCopyStateFit, createCopyStateFitUiState, metadataToCopyStateFit, previewCopyStateFitDrag, resetCopyStateFitUiState,
  selectActiveCopyStateFit,
} from "../../components/purityPloidySlider/copyStateFit";
import {
  activeChoice, allelicFit, binIntervals, blockMeanCn, cladePloidyRows, cnAt, fitCurve, fitOptions, groupOfChoice, integerFit,
  ploidySummary, segmentIntervals, separatorsOf, solutionOf,
} from "../../helpers/singleCell/cnFit";

const { Text } = Typography;
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? "n/a" : x.toFixed(d));
const pct = (x) => (x == null ? "not available" : `${(100 * x).toFixed(0)}%`);
const th = { textAlign: "left", padding: "2px 10px", fontWeight: 600 };
const td = { padding: "2px 10px" };

/**
 * Single-cell purity / ploidy fit in the layout of the bulk Purity-Ploidy Fit tab: the bin plot (segment-mean histogram
 * stacked by chromosome) with draggable copy-state lines, Apply / Reset, and the fit read-out. The data are one cell,
 * a clade (pooled) or the selected cells. The bin plot and its controls are the bulk components.
 */
export default function SingleCellPpfitTab() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const { cells, selectedCellIds, layout } = useSelector((s) => s.SingleCell);
  const clades = usePatientClades();
  const [wrapRef, width] = useContainerWidth(900);
  const [choice, setChoice] = useState(layout?.ppfitFocus || null);
  useEffect(() => {
    if (layout?.ppfitFocus) setChoice(layout.ppfitFocus);
  }, [layout?.ppfitFocus]);

  const rows = useMemo(() => (clades.status === "ok" ? cladePloidyRows(clades.data.clades, cells) : []), [clades, cells]);
  const options = useMemo(() => fitOptions({ selectedCellIds, rows, cells }), [selectedCellIds, rows, cells]);
  const active = activeChoice(choice, options);
  const group = useMemo(() => groupOfChoice(active, { selectedCellIds, rows }), [active, selectedCellIds, rows]);
  const data = useFitData(dataset, group.ids);

  const groupCells = group.ids.map((id) => cells.find((c) => c.cell_id === id)).filter(Boolean);
  const fitPloidy = data.status === "ok" ? (data.single ? data.ploidy : ploidySummary(groupCells).median || 2) : null;
  const fitPurity = data.status === "ok" && data.single ? data.purity : 1;
  const fitSol = fitPloidy ? solutionOf(fitPloidy, fitPurity) : null;

  // the bulk fit session: metadata fit from the cell's own fit, preview while dragging, applied override, reset
  const [ui, setUi] = useState(null);
  const metadataFit = useMemo(() => (fitSol ? metadataToCopyStateFit(separatorsOf(fitSol)) : null), [fitSol && fitSol.ploidy, fitSol && fitSol.purity]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setUi(null), [metadataFit]);
  const session = metadataFit ? ui || createCopyStateFitUiState(metadataFit) : null;
  const activeFit = session ? selectActiveCopyStateFit(session) : null;

  const intervals = useMemo(() => {
    if (data.status !== "ok" || !Object.keys(chromoBins || {}).length) return [];
    if (data.single && data.segments?.length) return segmentIntervals(data.segments, solutionOf(data.meanY, 1));
    return binIntervals(data.binX, data.binM, chromoBins);
  }, [data, chromoBins]);
  const usesSegments = data.status === "ok" && data.single && Boolean(data.segments?.length);
  const tooltipAttributes = useMemo(
    () => ({ iid: "", mean: ".4f", ...(usesSegments ? { y: ",.2f" } : {}), chromosome: "", width: ",", startPoint: ",", endPoint: "," }),
    [usesSegments]
  );

  const curve = useMemo(() => (data.status === "ok" ? fitCurve(data.m, fitPurity, 1, 6, 0.05) : null), [data, fitPurity]);
  const blocks = useMemo(() => {
    if (data.status !== "ok" || !data.single || !data.blocks) return null;
    return data.blocks.map((b) => {
      const cn = blockMeanCn(data.xs, data.ys, b.x0, b.x1);
      return { ...b, _cn: cn, _m: cn == null ? null : cn / data.meanY };
    }).filter((b) => b._m != null);
  }, [data]);
  const fitRow = (name, f) => {
    const cov = data.status === "ok" && f ? integerFit(data.m, f) : null;
    const al = blocks && f ? allelicFit(blocks, (b) => cnAt(f, b._m)) : null;
    return { name, f, cov, al };
  };
  const tableRows = fitSol && activeFit ? [fitRow("Fitted", fitSol), fitRow("Current lines", activeFit)] : [];
  const inGroup = new Set(group.ids);
  const restCells = cells.filter((c) => !inGroup.has(c.cell_id) && c.clone_id !== "Normal");

  const transform = (fn) => setUi((cur) => fn(cur || createCopyStateFitUiState(metadataFit)));

  return (
    <Wrapper>
      <div ref={wrapRef}>
        {!options.length ? (
          <Card size="small"><Text type="secondary">Not available (no cells with a ploidy).</Text></Card>
        ) : (
          <>
            <Card size="small" title="Cells to fit">
              <Space wrap>
                <Select style={{ minWidth: 400 }} size="small" value={active} onChange={setChoice} options={options} showSearch optionFilterProp="label" />
                <Text type="secondary">a cell, a clade (pooled) or the cells selected on the Single-Cell tab</Text>
              </Space>
              {data.status === "ok" && !data.single && (
                <div>
                  <Text type="secondary">
                    {`Pooled coverage of ${data.used} of ${data.requested} cells${data.requested > MAX_POOLED ? ` (an even sample of ${MAX_POOLED})` : ""}; fitted ploidy is the median of the cells' ploidy. Bars are 100 kb to 1 Mb bin medians; allelic support is shown for single cells.`}
                  </Text>
                </div>
              )}
            </Card>
            {data.status === "loading" && <Text type="secondary">Loading coverage...</Text>}
            {data.status === "missing" && <Alert type="info" showIcon message={`Not available (${data.reason}).`} />}
            {data.status === "error" && <Alert type="error" showIcon message={`Could not load: ${data.error?.message || "error"}`} />}
            {data.status === "ok" && activeFit && (
              <>
                <Row className="ant-panel-container ant-home-plot-container" gutter={16}>
                  <Col className="gutter-row" span={24}>
                    <BinPlotWrapper visible>
                      <Card
                        size="small"
                        title={<Space><span role="img" className="anticon anticon-dashboard"><GiHistogram /></span><span className="ant-pro-menu-item-title">Total width over segment mean (single cell)</span></Space>}
                      >
                        {intervals.length ? (
                          <div className="ant-wrapper">
                            <CopyStateFitControls
                              activeCopyStateFit={activeFit}
                              hasFitSession={ui != null}
                              hasPreview={session.previewFit != null}
                              onApply={() => transform(applyPreviewCopyStateFit)}
                              onReset={() => transform(resetCopyStateFitUiState)}
                            />
                            <BinPlot
                              width={Math.max(400, width - 34)}
                              height={520}
                              data={intervals}
                              xTitle="Segment Intensity Mean Value →"
                              yTitle="↑ Cumulative Width"
                              selectSegment={() => {}}
                              separatorsConfig={separatorsOf(fitSol)}
                              activeCopyStateFit={activeFit}
                              tooltipAttributes={tooltipAttributes}
                              onCopyStateFitPreview={(drag) => drag != null && transform((cur) => previewCopyStateFitDrag(cur, drag))}
                            />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {usesSegments ? "JaBbA segments of the cell" : "Coverage bin medians"}, coloured by chromosome. Drag a line to shift all copy states, shift-drag to change their spacing; Apply keeps the lines, Reset restores the fit.
                            </Text>
                          </div>
                        ) : (
                          <Text type="secondary">Not available (no genome positions for the coverage bins).</Text>
                        )}
                      </Card>
                    </BinPlotWrapper>
                  </Col>
                </Row>
                <Row className="ant-panel-container" gutter={16}>
                  <Col span={24}>
                    <Card size="small" title="Fit read-out">
                      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr>{["", "ploidy", "purity", "bins within 0.25 of an integer CN (chance 50%)", "allelic gap |observed - nearest minor/total|", "allelic segments within 0.1"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {tableRows.map((r) => (
                            <tr key={r.name}>
                              <td style={td}>{r.name}</td>
                              <td style={td}>{fmt(r.f.ploidy)}</td>
                              <td style={td}>{fmt(r.f.purity)}</td>
                              <td style={td}>{pct(r.cov)}</td>
                              <td style={td}>{r.al ? `${fmt(r.al.gap, 3)} over ${r.al.blocks} segments` : data.single ? "not available (no hetblocks.json)" : "single cells only"}</td>
                              <td style={td}>{r.al ? pct(r.al.within) : "not available"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Coverage alone cannot separate a genome from its doubled copy (both put the bins on integer states); the allelic gap can: segments whose minor-allele fraction no integer split of the line's copy number gives point to a wrong ploidy.
                      </Text>
                    </Card>
                  </Col>
                </Row>
                <Row className="ant-panel-container" gutter={16}>
                  <Col span={24}>
                    <Card size="small" title="Integer fit by trial ploidy">
                      <FitCurve width={Math.max(400, width - 34)} curve={curve} fitPloidy={fitPloidy} ploidy={activeFit.ploidy} />
                      <Text type="secondary" style={{ fontSize: 12 }}>Grey: fitted ploidy; orange: the lines as dragged.</Text>
                    </Card>
                  </Col>
                </Row>
                {blocks && (
                  <Row className="ant-panel-container" gutter={16}>
                    <Col span={24}>
                      <Card size="small" title="Allelic support">
                        <MafPlot width={Math.max(400, width - 34)} blocks={blocks} sol={activeFit} />
                      </Card>
                    </Col>
                  </Row>
                )}
                <Row className="ant-panel-container" gutter={16}>
                  <Col span={24}>
                    <Card size="small" title="Ploidy by clade">
                      {rows.length ? (
                        <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>{["clade", "cells", "median ploidy", "quartiles", "share at or above 2.4", "rest of patient (median)"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.id} onClick={() => setChoice(`clade:${r.id}`)} style={{ cursor: "pointer", fontWeight: active === `clade:${r.id}` ? 700 : 400 }}>
                                <td style={td}>{r.id}</td>
                                <td style={td}>{r.cells.length}</td>
                                <td style={td}>{fmt(r.summary.median)}</td>
                                <td style={td}>{`${fmt(r.summary.q1)} - ${fmt(r.summary.q3)}`}</td>
                                <td style={td}>{pct(r.summary.fracHigh)}</td>
                                <td style={td}>{fmt(r.rest.median)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <Text type="secondary">{clades.status === "missing" ? "Not available (no clades.json)." : "No clade with enough cells."}</Text>
                      )}
                      <div style={{ marginTop: 8 }}>
                        <PloidyStrip width={Math.max(400, width - 34)} groupCells={groupCells} restCells={restCells} label={group.label} />
                        <Text type="secondary" style={{ fontSize: 12 }}>Per-cell fitted ploidy: this group (orange) against the rest of the patient (grey); bars mark medians. Click a clade row to fit it.</Text>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </>
            )}
          </>
        )}
      </div>
    </Wrapper>
  );
}
