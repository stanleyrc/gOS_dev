import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Col, Empty, Row, Segmented, Skeleton, Space, Typography } from "antd";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import useStory from "./useStory";
import StoryChapter from "./storyChapter";
import { SC_GUTTER } from "../density";

const { Title, Text } = Typography;

/**
 * The cohort story: chapters across patients, then each patient's vignettes
 * (precomputed by analysis/story/scripts/story.py into _cohort/story.json).
 */
export default function CohortStory({ dataset, summaries = [], cloneColors = {}, onOpen }) {
  const { t } = useTranslation("common");
  const { status, story } = useStory(dataset);
  const ids = story ? Object.keys(story.patients) : [];
  const [patient, setPatient] = useState(null);
  if (status === "loading") return <Skeleton active />;
  if (!story) return <Empty description={t("components.single-cell.story.none")} />;
  const current = patient && story.patients[patient] ? patient : ids[0];
  const summary = summaries.find((s) => s.caseReportId === current);
  return (
    <Row gutter={SC_GUTTER}>
      <Col span={24}>
        <Title level={4} style={{ marginBottom: 0 }}>{story.title}</Title>
        <Text type="secondary" style={{ fontSize: TYPE.label }}>{t("components.single-cell.story.subtitle", { date: story.generated || "" })}</Text>
      </Col>
      {story.chapters.map((c) => (
        <Col span={24} key={c.id}>
          <StoryChapter section={c} groupColors={cloneColors} provenance={`story-${c.id}`} />
        </Col>
      ))}
      {ids.length > 0 && (
        <Col span={24}>
          <Space wrap>
            <Title level={5} style={{ margin: 0 }}>{t("components.single-cell.story.patients")}</Title>
            <Segmented size="small" options={ids} value={current} onChange={setPatient} />
            {summary && onOpen && <Button size="small" type="link" onClick={() => onOpen(summary)}>{t("components.single-cell.cohort.open")}</Button>}
          </Space>
        </Col>
      )}
      {current && story.patients[current].vignettes.map((v) => (
        <Col span={24} key={v.id}>
          <StoryChapter section={v} groupColors={cloneColors} provenance={`story-${v.id.replace(/^[^-]+-/, "")}`} />
        </Col>
      ))}
      <Col span={24}>
        <Alert type="info" showIcon message={t("components.single-cell.story.caveat")} />
      </Col>
    </Row>
  );
}
