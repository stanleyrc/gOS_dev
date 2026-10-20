import React, { useMemo, useState } from "react";
import { Card, Empty, Radio, Select, Space, Typography } from "antd";
import { ForkOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { signatureColorOf } from "../signaturePanel";
import useSignatureVersions, { NOT_EXPORTED } from "./signatureVersionsData";
import {
  CHAIN_PRESETS,
  DEFAULT_VERSION,
  DEFAULT_VERSION_B,
  NOT_IN_VERSION,
  OTHER_NODE,
  SPLITS,
  SPLIT_NOTE,
  alluvialLayout,
  chainIds,
  flowBetween,
  linkText,
  reassignedFraction,
  versionList,
} from "../../../helpers/singleCell/signatureVersions";

const { Text } = Typography;
const NODE_W = 14;
const LABEL_W = 96;
const PAD_T = 22;
const nodeColor = (k) => (k === NOT_IN_VERSION ? "#bdbdbd" : k === OTHER_NODE ? "#e0e0e0" : signatureColorOf(k));
const CUSTOM = "custom";

/**
 * Alluvial (Sankey) of the per-SNV signature assignment between two versions (A -> B) or a chain of versions, for all
 * SNVs or one split (singletons, shared, private tree sites). Node colours = the signature colours of the tab.
 */
export default function SignatureFlowCard() {
  const { data } = useSignatureVersions();
  const [ref, width] = useContainerWidth(900);
  const [a, setA] = useState(DEFAULT_VERSION);
  const [b, setB] = useState(DEFAULT_VERSION_B);
  const [chain, setChain] = useState(CUSTOM);
  const [split, setSplit] = useState("all");
  const [hover, setHover] = useState(null);
  const list = useMemo(() => versionList(data), [data]);
  const ids = list.map((v) => v.id);
  const labelOf = (id) => list.find((v) => v.id === id)?.label || id;
  const colIds = useMemo(() => {
    const raw = chain === CUSTOM ? [ids.includes(a) ? a : ids[0], ids.includes(b) ? b : ids[1]] : chain.split(">");
    return chainIds(raw.filter((i) => ids.includes(i)));
  }, [chain, a, b, ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const flows = useMemo(() => {
    const out = [];
    for (let i = 0; i + 1 < colIds.length; i++) {
      const f = flowBetween(data, split, colIds[i], colIds[i + 1]);
      if (!f) return null;
      out.push(f);
    }
    return out.length ? out : null;
  }, [data, split, colIds]);
  const height = 360;
  const layout = useMemo(() => (flows ? alluvialLayout(flows, { height }) : null), [flows]);
  const title = <Space><ForkOutlined />Signature assignment flow between versions</Space>;
  if (!data) {
    return (
      <Card size="small" title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={NOT_EXPORTED} />
      </Card>
    );
  }
  const opts = list.map((v) => ({ value: v.id, label: v.label, disabled: !v.available }));
  const ncol = colIds.length;
  const innerW = Math.max(300, width - 2 * (LABEL_W + NODE_W));
  const colX = (i) => LABEL_W + NODE_W + (ncol > 1 ? (i * innerW) / (ncol - 1) : 0) - (i === ncol - 1 ? NODE_W : 0);
  const labels = colIds.map(labelOf);
  const nodeOf = (c, key) => layout.columns[c].nodes.find((n) => n.key === key);
  const reassigned = flows && flows.length === 1 ? reassignedFraction(flows[0].rows) : null;
  const splitHas = SPLITS.map((s) => ({ ...s, ok: Boolean(data.flows?.[s.value]) }));
  return (
    <Card
      size="small"
      title={title}
      extra={
        <Space wrap size={8}>
          <Select size="small" style={{ width: 220 }} value={chain} onChange={setChain}
            options={[{ value: CUSTOM, label: "A -> B (pick below)" }, ...CHAIN_PRESETS]} />
          {chain === CUSTOM && (
            <>
              <Select size="small" style={{ width: 230 }} value={colIds[0]} onChange={setA} options={opts} />
              <Text type="secondary">to</Text>
              <Select size="small" style={{ width: 230 }} value={colIds[1]} onChange={setB} options={opts} />
            </>
          )}
          <Radio.Group size="small" value={split} onChange={(e) => setSplit(e.target.value)} optionType="button"
            options={splitHas.filter((s) => s.ok).map((s) => ({ value: s.value, label: s.label }))} />
        </Space>
      }
    >
      <div ref={ref}>
        {!layout ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no assignment flow for this version pair and split)" />
        ) : (
          <>
            <svg width={width} height={layout.height + PAD_T + 8} role="img" aria-label="Alluvial diagram of per-SNV signature assignment between fit versions">
              {layout.links.map((l, i) => {
                const x0 = colX(l.col) + NODE_W;
                const x1 = colX(l.col + 1);
                const xm = (x0 + x1) / 2;
                const y0 = PAD_T + l.y0 + l.h / 2;
                const y1 = PAD_T + l.y1 + l.h / 2;
                const text = linkText(l, labels, layout.total);
                return (
                  <path
                    key={i}
                    d={`M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1}`}
                    fill="none"
                    stroke={nodeColor(l.source)}
                    strokeWidth={Math.max(1, l.h)}
                    opacity={hover === null ? 0.5 : hover === i ? 0.9 : 0.15}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{text}</title>
                  </path>
                );
              })}
              {layout.columns.map((c) => (
                <g key={c.index}>
                  <text x={colX(c.index) + NODE_W / 2} y={12} textAnchor={c.index === 0 ? "start" : c.index === ncol - 1 ? "end" : "middle"} fontSize={12} fontWeight={600} fill="currentColor"
                    dx={c.index === 0 ? -NODE_W / 2 : c.index === ncol - 1 ? NODE_W / 2 : 0}>{labels[c.index]}</text>
                  {c.nodes.map((n) => (
                    <g key={n.key}>
                      <rect x={colX(c.index)} y={PAD_T + n.y} width={NODE_W} height={Math.max(1, n.h)} fill={nodeColor(n.key)}>
                        <title>{`${n.key} in ${labels[c.index]}: ${n.n.toLocaleString("en-US")} SNVs (${((100 * n.n) / layout.total).toFixed(1)}% of ${labels[0]})`}</title>
                      </rect>
                      {n.h >= 11 && (
                        <text
                          x={c.index === ncol - 1 ? colX(c.index) + NODE_W + 4 : colX(c.index) - 4}
                          y={PAD_T + n.y + n.h / 2}
                          dy="0.35em"
                          fontSize={11}
                          textAnchor={c.index === ncol - 1 ? "start" : "end"}
                          fill="currentColor"
                        >
                          {n.key === NOT_IN_VERSION ? "not in version" : n.key}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              ))}
            </svg>
            <div style={{ minHeight: 20 }}>
              <Text>{hover !== null ? linkText(layout.links[hover], labels, layout.total) : `${layout.total.toLocaleString("en-US")} SNVs in ${labels[0]} (${SPLITS.find((s) => s.value === split)?.label}); hover a flow for counts.`}</Text>
              {reassigned != null && hover === null && <Text type="secondary"> {(100 * reassigned).toFixed(1)}% of SNVs present in both versions change signature.</Text>}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{SPLIT_NOTE}.</Text>
          </>
        )}
      </div>
    </Card>
  );
}
