import React from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Col, Empty, Row, Skeleton, Typography } from "antd";
import SingleCellWrapper from "../../components/singleCell/index.style";
import useStory from "../../components/singleCell/story/useStory";
import StoryChapter from "../../components/singleCell/story/storyChapter";
import { sentencesAbout, storyForPatient } from "../../helpers/singleCell/story";
import { SC_GUTTER } from "../../components/singleCell/density";

const { Title, Text } = Typography;

/** The open patient's part of the single-cell story: its vignettes, then what the cohort chapters say about it. */
export default function SingleCellStoryTab() {
  const { t } = useTranslation("common");
  const dataset = useSelector((state) => state.Settings.dataset);
  const { patient, cloneColors } = useSelector((state) => state.SingleCell);
  const { status, story } = useStory(dataset);
  const id = patient?.caseReportId;
  if (status === "loading") return <Skeleton active />;
  const { vignettes, chapters } = storyForPatient(story, id);
  if (!vignettes.length && !chapters.length) return <Empty description={t("components.single-cell.story.none-patient")} />;
  return (
    <SingleCellWrapper>
      <Row gutter={SC_GUTTER}>
        <Col span={24}>
          <Title level={4} style={{ marginBottom: 0 }}>{t("components.single-cell.story.patient-title", { patient: id })}</Title>
          <Text type="secondary">{t("components.single-cell.story.subtitle", { date: story?.generated || "" })}</Text>
        </Col>
        {vignettes.map((v) => (
          <Col span={24} key={v.id}>
            <StoryChapter section={v} groupColors={cloneColors} provenance={`story-${v.id.replace(/^[^-]+-/, "")}`} />
          </Col>
        ))}
        {chapters.length > 0 && (
          <Col span={24}>
            <StoryChapter
              section={{
                id: "cohort",
                title: t("components.single-cell.story.in-cohort"),
                lede: t("components.single-cell.story.in-cohort-lede"),
                body: chapters.map((c) => `${c.title}: ${c.body.flatMap((b) => sentencesAbout(b, id)).join(" ")}`).filter((b) => !b.endsWith(": ")),
                stats: [],
                figure: null,
              }}
              provenance="story"
            />
          </Col>
        )}
      </Row>
    </SingleCellWrapper>
  );
}
