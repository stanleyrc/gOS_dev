import React from "react";
import { Card, Space, Tag, Typography } from "antd";

const { Title, Paragraph, Text } = Typography;

/** "toy example" badge: every synthetic toy carries one. */
export const ToyTag = () => <Tag color="purple" style={{ marginInlineEnd: 0 }}>toy example (synthetic)</Tag>;

/** A link that opens a real gOS view: in-app (onClick) when given, else a new tab. */
export function RealLink({ href, onClick, children }) {
  if (onClick) return <a href={href} onClick={(e) => { e.preventDefault(); onClick(); }}>{children}</a>;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

/** Layout of one explainer: intro, interactive toy, what it means in this paper, references. */
export default function ExplainerShell({ title, intro, toy, paper, refs }) {
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small">
        <Title level={4} style={{ marginTop: 0 }}>{title}</Title>
        {intro.map((p) => <Paragraph key={p.slice(0, 40)} style={{ maxWidth: 900 }}>{p}</Paragraph>)}
      </Card>
      <Card size="small" title={<Space size={8}><span>Try it</span><ToyTag /></Space>}>
        {toy}
      </Card>
      <Card size="small" title="What it means in this paper">{paper}</Card>
      <Card size="small" title="References">
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {refs.map((r) => <li key={r.text}><Text style={{ fontSize: 13 }}>{r.text} </Text>{r.href && <a href={r.href} target="_blank" rel="noopener noreferrer">link</a>}</li>)}
        </ol>
      </Card>
    </Space>
  );
}
