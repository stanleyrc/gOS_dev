import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { Alert, Card, Collapse, Input, Skeleton, Space, Tag, Typography } from "antd";
import { METHODS_PATH, normalizeMethods, searchMethods } from "../../../helpers/singleCell/methodsDoc";

const { Text } = Typography;
const url = () => `${(process.env.PUBLIC_URL || "").replace(/\/$/, "")}/${METHODS_PATH}`;

/** Methods: sections rendered from public/methods/methods.json (gos_methods_v1); each with a collapsible source line and a "to confirm" tag. */
export default function MethodsView() {
  const [state, setState] = useState({ status: "loading" });
  const [query, setQuery] = useState("");
  useEffect(() => {
    let live = true;
    axios.get(url(), { responseType: "json" })
      .then((r) => live && setState({ status: "ok", doc: normalizeMethods(typeof r.data === "string" ? null : r.data) }))
      .catch(() => live && setState({ status: "ok", doc: normalizeMethods(null) }));
    return () => { live = false; };
  }, []);
  const doc = state.doc;
  const shown = useMemo(() => (doc?.ok ? searchMethods(doc.sections, query) : []), [doc, query]);
  if (state.status === "loading") return <Skeleton active />;
  if (!doc.ok) return <Alert type="info" showIcon message={`Methods: not available (${doc.reason})`} />;
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Input.Search allowClear placeholder="Search the methods" style={{ width: 280 }} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Text type="secondary">{`${shown.length} of ${doc.sections.length} sections`}</Text>
      </Space>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {doc.sections.map((s) => <a key={s.id} href={`#methods-${s.id}`}>{s.title}</a>)}
      </div>
      {shown.map((s) => (
        <Card key={s.id} id={`methods-${s.id}`} size="small" title={<span>{s.title} {s.toConfirm && <Tag color="orange">to confirm</Tag>}</span>}>
          <div className="sc-methods-body"><ReactMarkdown>{s.body_md}</ReactMarkdown></div>
          {s.sources.length > 0 && (
            <Collapse ghost size="small" items={[{ key: "src", label: <Text type="secondary" style={{ fontSize: 12 }}>{`source (${s.sources.length})`}</Text>, children: <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{s.sources.map((p) => <li key={p}><code>{p}</code></li>)}</ul> }]} />
          )}
        </Card>
      ))}
    </Space>
  );
}
