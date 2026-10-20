import React, { Suspense, useEffect, useState } from "react";
import { Card, Col, Row, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { CONCEPTS } from "../../../helpers/singleCell/concepts/conceptsCatalog";

const JunctionBalanceExplainer = React.lazy(() => import("./concepts/junctionBalanceExplainer"));
const JointBalanceExplainer = React.lazy(() => import("./concepts/jointBalanceExplainer"));
const PathExplainer = React.lazy(() => import("./concepts/pathExplainer"));
const VIEWS = { balance: JunctionBalanceExplainer, joint: JointBalanceExplainer, path: PathExplainer };

const { Text, Paragraph } = Typography;

const readParam = () => {
  if (typeof window === "undefined") return null;
  const c = new URLSearchParams(window.location.search).get("concept");
  return VIEWS[c] ? c : null;
};
// keeps ?concept= in the address bar while the view is open (a shared link: ?scview=concepts&concept=<id>)
const writeParam = (id) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("concept", id);
  else url.searchParams.delete("concept");
  window.history.replaceState(window.history.state, "", url.toString());
};

/**
 * Guide > Concepts: a menu of interactive explainers of the methods behind the paper (toy examples, generated in code
 * and labelled), each with what it means in this paper (links to the real views) and references. ?concept=<id> opens one.
 */
export default function ConceptsView({ dataset, onView }) {
  const [current, setCurrent] = useState(() => readParam() || "balance");
  useEffect(() => { writeParam(current); }, [current]);
  useEffect(() => () => writeParam(null), []);
  const open = (id) => { setCurrent(id); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };
  const concept = CONCEPTS.find((c) => c.id === current);
  const View = VIEWS[current];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small">
        <Paragraph style={{ marginBottom: 8 }}>
          Interactive explainers of ideas this paper builds on, and of the new ones it introduces. Each uses a small <Text strong>toy example generated in the browser</Text>: it is there to teach, not to show results. Real results are one click away under "What it means in this paper".
        </Paragraph>
        <Row gutter={[10, 10]}>
          {CONCEPTS.filter((c) => c.status === "built").map((c) => (
            <Col key={c.id} xs={24} md={8}>
              <Card size="small" hoverable onClick={() => open(c.id)} data-concept-card={c.id}
                style={{ height: "100%", cursor: "pointer", borderColor: c.id === current ? "var(--ant-color-primary, #1677ff)" : undefined, borderWidth: c.id === current ? 2 : 1 }}>
                <Text strong>{c.title}</Text>
                <div><Text type="secondary" style={{ fontSize: 12.5 }}>{c.blurb}</Text></div>
              </Card>
            </Col>
          ))}
        </Row>
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          <Text type="secondary">Planned next: </Text>
          {CONCEPTS.filter((c) => c.status !== "built").map((c) => <Tooltip key={c.id} title={c.blurb}><Tag style={{ marginBottom: 4 }}>{c.title}</Tag></Tooltip>)}
        </div>
      </Card>
      <Suspense fallback={<Skeleton active />}>
        {View && <View key={current} concept={concept} dataset={dataset} onView={onView} onConcept={open} />}
      </Suspense>
    </Space>
  );
}
