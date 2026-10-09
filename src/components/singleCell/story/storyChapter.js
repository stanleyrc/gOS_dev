import React from "react";
import { Card, Col, Row, Space, Statistic, Typography } from "antd";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";
import StoryFigure from "./storyFigures";
import { SC_GUTTER_INNER } from "../density";

const { Paragraph, Text } = Typography;

/** One chapter / vignette: title, lede, the computed text, key numbers and its figure. */
export default function StoryChapter({ section, groupColors, extra = null, provenance = "story" }) {
  const wide = section.figure && ["bars", "dots", "table"].includes(section.figure.type);
  return (
    <Card
      size="small"
      title={
        <Space size={6}>
          <span>{section.title}</span>
          <Provenance id={provenance} />
        </Space>
      }
      extra={extra}
    >
      {section.lede && <Text type="secondary" style={{ fontSize: TYPE.label, display: "block", marginBottom: 6 }}>{section.lede}</Text>}
      <Row gutter={SC_GUTTER_INNER}>
        <Col xs={24} xl={section.figure && !wide ? 13 : 24}>
          {section.body.map((b, i) => (
            <Paragraph key={i} style={{ fontSize: TYPE.body, marginBottom: 8, maxWidth: 900 }}>{b}</Paragraph>
          ))}
          {section.stats.length > 0 && (
            <Space size="large" wrap style={{ marginBottom: 8 }}>
              {section.stats.map((s) => <Statistic key={s.label} title={s.label} value={s.value} />)}
            </Space>
          )}
        </Col>
        {section.figure && (
          <Col xs={24} xl={wide ? 24 : 11}>
            <StoryFigure figure={section.figure} groupColors={groupColors} />
          </Col>
        )}
      </Row>
    </Card>
  );
}
