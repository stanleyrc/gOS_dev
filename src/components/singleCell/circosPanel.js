import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Segmented, Select, Space, Switch, Typography } from "antd";
import { RadarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import SvgExportButton from "./svgExportButton";
import singleCellActions from "../../redux/singleCell/actions";
import { casePath, tryGet } from "../../redux/singleCell/loaders";
import { cnColorer } from "../../helpers/singleCell/matrix";

const { Text } = Typography;
const cache = new Map();

/**
 * Circos of one cell's genome graph: chromosome ideogram ring, copy number
 * ring (heatmap palette), and junctions as arcs through the centre
 * (colour by type: INV / DEL / DUP-like / TRA). Pick any cell; the current
 * selection's cells are offered first.
 */
export default function CircosPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cells, selectedCellIds, cloneColors, palette, patient } = useSelector((s) => s.SingleCell);
  const { chromoBins, genomeLength, dataset } = useSelector((s) => s.Settings);
  const [ref, width] = useContainerWidth(900);
  const [cellId, setCellId] = useState(null);
  const [genome, setGenome] = useState(null);
  const [showCn, setShowCn] = useState(true);
  const [junctionMode, setJunctionMode] = useState("all");
  const chosen = cellId || selectedCellIds[0] || cells[0]?.cell_id || null;

  useEffect(() => {
    if (!chosen || !dataset) return undefined;
    let active = true;
    const key = `${dataset.id}/${chosen}`;
    if (cache.has(key)) {
      setGenome(cache.get(key));
      return undefined;
    }
    setGenome(null);
    tryGet(casePath(dataset, chosen, "complex.json")).then((r) => {
      if (!active) return;
      const g = r.status === "ok" ? r.data : null;
      cache.set(key, g);
      setGenome(g);
    });
    return () => {
      active = false;
    };
  }, [chosen, dataset]);

  const size = Math.min(Math.max(420, width - 24), 820);
  const R = size / 2;
  const chromosomes = useMemo(() => Object.keys(chromoBins || {}), [chromoBins]);
  const angle = useMemo(() => {
    const total = genomeLength || d3.max(chromosomes, (c) => chromoBins[c].endPlace) || 1;
    const gapRad = 0.006;
    return (place) => -Math.PI / 2 + (place / total) * (2 * Math.PI - gapRad * chromosomes.length) + gapRad * (chromosomes.findIndex((c) => place >= chromoBins[c].startPlace && place <= chromoBins[c].endPlace) + 1);
  }, [genomeLength, chromosomes, chromoBins]);
  const toPlace = (chr, pos) => (chromoBins[chr] ? chromoBins[chr].startPlace + pos - chromoBins[chr].startPoint : null);
  const intervals = useMemo(() => (genome?.intervals || []).filter((i) => (i.type == null || i.type === "interval") && chromoBins[i.chromosome]), [genome, chromoBins]);
  const byIid = useMemo(() => new Map(intervals.map((i) => [i.iid, i])), [intervals]);
  const connections = useMemo(() => (genome?.connections || []).filter((c) => (junctionMode === "all" ? c.type === "ALT" : c.type === "ALT" && byIid.get(Math.abs(c.source))?.chromosome !== byIid.get(Math.abs(c.sink))?.chromosome)), [genome, junctionMode, byIid]);
  const color = useMemo(() => cnColorer(palette, "total"), [palette]);
  const rgba = (packed) => {
    const r = packed & 255;
    const g = (packed >> 8) & 255;
    const b = (packed >> 16) & 255;
    return `rgb(${r},${g},${b})`;
  };
  if (!chromosomes.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const ideoR = [R - 28, R - 12];
  const cnR = [R - 86, R - 34];
  const cnY = d3.scaleLinear().domain([0, 8]).range(cnR).clamp(true);
  const arcPath = (a0, a1, r0, r1) => d3.arc()({ innerRadius: r0, outerRadius: r1, startAngle: a0 + Math.PI / 2, endAngle: a1 + Math.PI / 2 });
  const endOf = (iid) => {
    const i = byIid.get(Math.abs(iid));
    if (!i) return null;
    const pos = iid < 0 ? i.startPoint : i.endPoint; // sign = which end of the interval
    return toPlace(i.chromosome, pos);
  };
  const junctionColor = (c) => {
    const a = byIid.get(Math.abs(c.source));
    const b = byIid.get(Math.abs(c.sink));
    if (!a || !b) return "#999";
    if (a.chromosome !== b.chromosome) return "#7B3294";
    return /INV/i.test(c.title) ? "#E6AB02" : /DEL/i.test(c.title) ? "#2C7BB6" : /DUP/i.test(c.title) ? "#D7191C" : "#1B9E77";
  };
  const clone = cells.find((c) => c.cell_id === chosen)?.clone_id;
  const cellOptions = [...new Set([...selectedCellIds, ...cells.map((c) => c.cell_id)])].map((id) => ({ value: id, label: `${id}${selectedCellIds.includes(id) ? " ✓" : ""}` }));

  return (
    <Card
      size="small"
      title={<Space><RadarChartOutlined />{t("components.single-cell.circos.title")}{clone && <Text style={{ color: cloneColors[clone] }}>{clone}</Text>}</Space>}
      extra={
        <Space wrap>
          <Select size="small" showSearch style={{ width: 260 }} value={chosen} onChange={setCellId} options={cellOptions} />
          <Segmented size="small" value={junctionMode} onChange={setJunctionMode} options={[{ value: "all", label: t("components.single-cell.circos.all-junctions") }, { value: "inter", label: t("components.single-cell.circos.inter") }]} />
          <Switch size="small" checked={showCn} onChange={setShowCn} />
          <Text>{t("components.single-cell.circos.cn-ring")}</Text>
          <SvgExportButton containerRef={ref} name={`circos-${chosen}`} />
        </Space>
      }
    >
      <div ref={ref} style={{ display: "flex", justifyContent: "center" }}>
        {!genome ? (
          <Text type="secondary">{t("components.single-cell.loading")}</Text>
        ) : (
          <svg width={size} height={size}>
            <g transform={`translate(${R},${R})`}>
              {chromosomes.map((chr, i) => {
                const c = chromoBins[chr];
                const a0 = angle(c.startPlace);
                const a1 = angle(c.endPlace);
                const mid = (a0 + a1) / 2;
                return (
                  <g key={chr}>
                    <path d={arcPath(a0, a1, ideoR[0], ideoR[1])} fill={i % 2 ? "#8c8c8c" : "#bfbfbf"} />
                    <text x={Math.cos(mid) * (R - 2)} y={Math.sin(mid) * (R - 2)} dy="0.35em" textAnchor="middle" fontSize={11} fill="#262626" transform={`rotate(${(mid * 180) / Math.PI + 90} ${Math.cos(mid) * (R - 2)} ${Math.sin(mid) * (R - 2)})`}>
                      {chr}
                    </text>
                    {showCn && <path d={arcPath(a0, a1, cnR[0], cnR[1])} fill="#f5f5f5" />}
                  </g>
                );
              })}
              {showCn &&
                intervals.map((iv) => {
                  const p0 = toPlace(iv.chromosome, iv.startPoint);
                  const p1 = toPlace(iv.chromosome, iv.endPoint);
                  if (p0 == null || p1 == null) return null;
                  const y = Number(iv.y);
                  return (
                    <path key={iv.iid} d={arcPath(angle(p0), angle(Math.max(p1, p0 + 1)), cnR[0], cnY(y))} fill={rgba(color(y))}>
                      <title>{`${iv.chromosome}:${iv.startPoint.toLocaleString()}-${iv.endPoint.toLocaleString()} · CN ${y}`}</title>
                    </path>
                  );
                })}
              {connections.map((c) => {
                const p0 = endOf(c.source);
                const p1 = endOf(c.sink);
                if (p0 == null || p1 == null) return null;
                const r = (showCn ? cnR[0] : ideoR[0]) - 4;
                const [x0, y0] = [Math.cos(angle(p0)) * r, Math.sin(angle(p0)) * r];
                const [x1, y1] = [Math.cos(angle(p1)) * r, Math.sin(angle(p1)) * r];
                const d = Math.hypot(x1 - x0, y1 - y0);
                const pull = Math.min(0.9, d / (2 * r));
                const [cx, cy] = [((x0 + x1) / 2) * (1 - pull), ((y0 + y1) / 2) * (1 - pull)];
                return (
                  <path key={c.cid} d={`M${x0},${y0} Q${cx},${cy} ${x1},${y1}`} fill="none" stroke={junctionColor(c)} strokeWidth={1.4} strokeOpacity={0.8}>
                    <title>{`${c.title} · ${byIid.get(Math.abs(c.source))?.chromosome}:${(c.source < 0 ? byIid.get(Math.abs(c.source))?.startPoint : byIid.get(Math.abs(c.source))?.endPoint)?.toLocaleString()} → ${byIid.get(Math.abs(c.sink))?.chromosome}:${(c.sink < 0 ? byIid.get(Math.abs(c.sink))?.startPoint : byIid.get(Math.abs(c.sink))?.endPoint)?.toLocaleString()}`}</title>
                  </path>
                );
              })}
              <text x={0} y={-8} textAnchor="middle" fontSize={14} fontWeight={600} fill="#262626">{chosen}</text>
              <text x={0} y={12} textAnchor="middle" fontSize={12} fill="#595959">{t("components.single-cell.circos.summary", { junctions: connections.length, segments: intervals.length })}</text>
            </g>
          </svg>
        )}
      </div>
      <Space wrap style={{ marginTop: 6, fontSize: 12 }}>
        {[["#7B3294", "TRA"], ["#E6AB02", "INV"], ["#2C7BB6", "DEL"], ["#D7191C", "DUP"], ["#1B9E77", "other"]].map(([c, l]) => (
          <span key={l}><span className="sc-swatch" style={{ background: c }} />{l}</span>
        ))}
        <Text type="secondary">{t("components.single-cell.circos.help")}</Text>
        {patient && <Text type="link" onClick={() => dispatch(singleCellActions.updateSelection([chosen]))} style={{ cursor: "pointer" }}>{t("components.single-cell.circos.select-cell")}</Text>}
      </Space>
    </Card>
  );
}
