import React, { useRef, useState } from "react";
import { Alert, Card, Collapse, Empty, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { STATUS_LABEL, VERDICTS, featureTally, holdsOrNot, sortNovel, verdictOf } from "../../../helpers/singleCell/portrait";
import PortraitCard, { PortraitLink, VerdictTag } from "../portrait/portraitCard";
import useCohortExport from "./useCohortExport";

const { Text, Paragraph } = Typography;
const STATUS_COLOR = { robust: "green", candidate: "blue", exploratory: "default" };

function Glyph({ cell }) {
  const v = verdictOf(cell?.verdict);
  const colors = { consistent: "#237804", inconsistent: "#cf1322", not_testable: "#ad6800", not_applicable: "#8c8c8c" };
  return (
    <Tooltip title={<div style={{ maxWidth: 420 }}><b>{v.label}</b>: {cell?.evidence}</div>}>
      <PortraitLink link={cell?.link}>
        <span style={{ color: colors[cell?.verdict] || "#8c8c8c", fontWeight: 700, fontSize: TYPE.title }}>{v.glyph}</span>
      </PortraitLink>
    </Tooltip>
  );
}

function Matrix({ data, onPatient }) {
  const m = data.matrix;
  const columns = [
    { title: "Canonical GBM feature", key: "f", fixed: "left", width: 230, render: (_, r) => <Tooltip title={r.canonical}><span>{r.label}</span></Tooltip> },
    ...m.patients.map((p) => ({
      title: <a onClick={() => onPatient(p)}>{p}</a>,
      key: p,
      width: 74,
      align: "center",
      render: (_, r) => <Glyph cell={m.cells[p][r.key]} />,
    })),
    { title: "Across patients", key: "t", width: 250, render: (_, r) => <Text style={{ fontSize: TYPE.label }}>{featureTally(m, r.key).text}</Text> },
  ];
  return <Table size="small" rowKey="key" pagination={false} dataSource={m.features} columns={columns} scroll={{ x: true }} />;
}

function Summary({ data }) {
  const { holds, fails, open } = holdsOrNot(data.matrix);
  const list = (items) => items.map((f) => `${f.label} (${f.tally.text})`).join("; ");
  const items = [];
  if (holds.length) items.push(<li key="h"><b>Holds:</b> {list(holds)}.</li>);
  if (fails.length) items.push(<li key="f"><b>Does not hold in most patients:</b> {list(fails)}.</li>);
  if (open.length) items.push(<li key="o"><b>Not decidable here (underpowered, not assessed, or absent):</b> {list(open)}.</li>);
  return <ul style={{ margin: 0, paddingLeft: 18, fontSize: TYPE.body }}>{items}</ul>;
}

function NeftelTable({ links }) {
  const rows = Object.entries(links).map(([key, v]) => ({ key, ...v }));
  const cols = [
    { title: "Link (Neftel 2019)", key: "c", width: 260, render: (_, r) => r.claim },
    { title: "Verdict", key: "v", width: 150, render: (_, r) => <VerdictTag verdict={r.verdict} /> },
    { title: "Pooled carriers vs non-carriers, within patients", key: "e", render: (_, r) => <span style={{ fontSize: TYPE.label }}>{r.evidence}</span> },
    { title: "Informative patients", key: "i", width: 130, render: (_, r) => `${r.n_informative} of ${r.per_patient.length} with carriers` },
    { title: "", key: "l", width: 70, render: (_, r) => <PortraitLink link={{ scview: "eventassoc", evassoc: r.event.replace(" loss", " homdel") }}>forest</PortraitLink> },
  ];
  return <Table size="small" rowKey="key" pagination={false} dataSource={rows} columns={cols} scroll={{ x: true }} />;
}

function NovelList({ items }) {
  return (
    <div>
      {sortNovel(items).map((n) => (
        <Card key={n.id} size="small" style={{ marginBottom: 8 }}>
          <div style={{ fontSize: TYPE.body }}>
            <Tag color={STATUS_COLOR[n.status]}>{STATUS_LABEL[n.status] || n.status}</Tag>
            <Text strong>{n.title}</Text>
            <Text type="secondary" style={{ marginLeft: 8, fontSize: TYPE.label }}>{(n.patients || []).slice(0, 9).join(", ")}</Text>
          </div>
          <div style={{ fontSize: TYPE.label, marginTop: 4 }}>{n.text}</div>
          <div style={{ fontSize: TYPE.label, marginTop: 2 }}><Text type="secondary">Caveat: {n.caveat}</Text></div>
          <Space size={10} wrap style={{ marginTop: 4, fontSize: TYPE.label }}>
            {(n.links || []).map((l, i) => (
              <PortraitLink key={i} link={l}>{l.label}</PortraitLink>
            ))}
          </Space>
        </Card>
      ))}
    </div>
  );
}

/**
 * Cohort "Patient portraits" view: patients x canonical GBM features with verdict glyphs, the Novel list with
 * evidence links, caveats, and one portrait card per patient. Data: _cohort/portrait.json (srctools gos_sc_portrait.py).
 */
export default function CohortPortraitPanel({ dataset }) {
  const { status, data } = useCohortExport(dataset, "portrait.json");
  const [open, setOpen] = useState([]);
  const ref = useRef(null);
  if (status === "loading") return <Skeleton active />;
  if (!data) return <Empty description="Patient portraits are not available (_cohort/portrait.json has not been exported; srctools inst/gos_single_cell/gos_sc_portrait.py)." />;
  const jump = (p) => {
    setOpen((o) => (o.includes(p) ? o : [...o, p]));
    setTimeout(() => document.getElementById(`portrait-${p}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  return (
    <div ref={ref}>
      <Card size="small" title="Canonical GBM biology vs this cohort" extra={<Text type="secondary" style={{ fontSize: TYPE.label }}>{data.patients.length} patients · {Object.keys(VERDICTS).map((k) => `${VERDICTS[k].glyph} ${VERDICTS[k].label}`).join("   ")}</Text>} style={{ marginBottom: 8 }}>
        <Summary data={data} />
        <div style={{ marginTop: 8 }}>
          <Matrix data={data} onPatient={jump} />
        </div>
        <Paragraph type="secondary" style={{ fontSize: TYPE.label, margin: "6px 0 0" }}>
          Hover a glyph for the evidence, click it to open the view that shows it. {data.method}
        </Paragraph>
      </Card>
      <Card size="small" title="Genotype - cell state links (Neftel 2019): carriers vs non-carriers inside each patient" style={{ marginBottom: 8 }}>
        <NeftelTable links={data.neftel_links} />
      </Card>
      <Card size="small" title="Novel / unexpected" style={{ marginBottom: 8 }}>
        <NovelList items={data.novel} />
        <Collapse
          size="small"
          items={[
            {
              key: "cav",
              label: "Known caveats and artefacts (not findings)",
              children: (
                <>
                  {(data.caveat_items || []).map((c) => (
                    <div key={c.id} style={{ marginBottom: 6, fontSize: TYPE.label }}>
                      <Text strong>{c.title}. </Text>
                      {c.text} {(c.links || []).map((l, i) => <PortraitLink key={i} link={l}>{l.label}</PortraitLink>)}
                    </div>
                  ))}
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: TYPE.label }}>{data.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </>
              ),
            },
            { key: "ref", label: "References", children: <ul style={{ margin: 0, paddingLeft: 18, fontSize: TYPE.label }}>{data.references.map((c, i) => <li key={i}>{c}</li>)}</ul> },
          ]}
        />
      </Card>
      <Card size="small" title="Patient portraits">
        <Collapse
          activeKey={open}
          onChange={setOpen}
          items={data.patients.map((p) => ({
            key: p,
            label: <span id={`portrait-${p}`}><b>{p}</b> <Text type="secondary" style={{ fontSize: TYPE.label }}>{data.portraits[p].n_tumour_cells} tumour cells · {data.portraits[p].novel.length} novel item(s)</Text></span>,
            children: <PortraitCard bare portrait={data.portraits[p]} patient={p} features={data.matrix.features} />,
          }))}
        />
      </Card>
    </div>
  );
}
