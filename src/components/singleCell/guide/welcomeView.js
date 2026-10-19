import React from "react";
import { Alert, Card, Col, Row, Space, Typography } from "antd";
import { WELCOME_FINDERS, WELCOME_SHOTS } from "../../../helpers/singleCell/welcomeCards";

const { Title, Paragraph, Text } = Typography;
const base = () => (process.env.PUBLIC_URL || "").replace(/\/$/, "");

/**
 * Welcome to the single-cell gOS: what the data is, annotated screenshots of the main pages and "where to find X" cards.
 * onFind({ scope, view, tab }) navigates (cohort view, or a patient's tab); onMethods opens Methods.
 */
export default function WelcomeView({ onFind }) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Title level={4} style={{ marginTop: 0 }}>Welcome to single-cell gOS</Title>
        <Paragraph>
          This is a browser for single-cell whole-genome (DNA PTA) data from glioblastoma, with matched single-cell RNA and slide-tag spatial data where available.
          Every tumour cell has a copy-number profile and mutation calls; cells are arranged on a phylogenetic tree, so you can ask what changed when, in which clone, and what the cells express.
        </Paragraph>
        <Paragraph style={{ marginBottom: 0 }}>
          The <Text strong>side bar on the left</Text> is always visible: it shows where you are, and expands on hover to list every page with a one-line description. Press <Text keyboard>?</Text> anywhere for searchable help.
        </Paragraph>
      </Card>
      <Card size="small" title="Where to find...">
        <Row gutter={[12, 12]}>
          {WELCOME_FINDERS.map((c) => (
            <Col key={c.label} xs={24} md={12} xl={8}>
              <Card size="small" hoverable onClick={() => onFind && onFind(c)} style={{ height: "100%" }} data-welcome-card>
                <Text strong>{c.label}</Text>
                <div><Text type="secondary" style={{ fontSize: 12.5 }}>{c.desc}</Text></div>
                <a style={{ fontSize: 12 }}>{c.scope === "cohort" ? "Open cohort view" : "Open in a patient"}</a>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
      <Card size="small" title="How to use it">
        <Row gutter={[16, 16]}>
          {WELCOME_SHOTS.map((s) => (
            <Col key={s.file} xs={24} xl={12}>
              <Text strong>{s.title}</Text>
              <Paragraph type="secondary" style={{ marginBottom: 6 }}>{s.text}</Paragraph>
              <img src={`${base()}/welcome/${s.file}`} alt={s.title} loading="lazy" style={{ width: "100%", border: "1px solid var(--sc-rail-border, #d9d9d9)", borderRadius: 6 }}
                onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "block"; }} />
              <Alert style={{ display: "none" }} type="info" showIcon message="not available (screenshot file missing from this build)" />
              <ol style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12.5 }}>{s.notes.map((n) => <li key={n}>{n}</li>)}</ol>
            </Col>
          ))}
        </Row>
      </Card>
    </Space>
  );
}
