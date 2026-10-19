import React from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Card, Collapse, Skeleton } from "antd";
import PatientReportCard from "../../components/singleCell/patientReportCard";
import SingleCellWrapper from "../../components/singleCell/index.style";
import ScEventModal from "../../components/singleCell/scEventModal";
import ClonalHistoryCard from "../../components/singleCell/clonalHistoryCard";
import NotableSvCard from "../../components/singleCell/notableSvCard";
import ComplexOrderCard from "../../components/singleCell/complexOrderCard";
import AmpTimingCard from "../../components/singleCell/ampTimingCard";
import BranchRatesCard from "../../components/singleCell/branchRatesCard";
import useClinicalAssays from "../../components/singleCell/clinical/useClinicalAssays";
import ClinicalStrip from "../../components/singleCell/clinical/clinicalStrip";
import HelpDrawer from "../../components/singleCell/helpDrawer";
import { selectMergedEvents } from "../../redux/interpretations/selectors";
import PortraitCard from "../../components/singleCell/portrait/portraitCard";
import usePatientPortrait from "../../components/singleCell/portrait/usePatientPortrait";
import useCohortExport from "../../components/singleCell/cohort/useCohortExport";
import PatientVignette from "../../components/singleCell/vignette/patientVignette";
import VignetteWrapper from "../../components/singleCell/vignette/vignette.style";
import useStory from "../../components/singleCell/story/useStory";
import StoryChapter from "../../components/singleCell/story/storyChapter";
import { sentencesAbout, storyForPatient } from "../../helpers/singleCell/story";
import { SUMMARY_DEFAULT_OPEN, summaryStoryChapters } from "../../helpers/singleCell/summaryTab";

/**
 * Summary of the open single-cell patient (the former Report and Story tabs, merged). Everything here is
 * deterministic: the vignette and driver report are computed in the browser, the story comes from precomputed templates.
 * Order: vignette, clonal history, amplicon timing and branch rates, full driver report (collapsed), cohort story.
 */
export default function SingleCellSummaryTab() {
  const { t } = useTranslation("common");
  const dataset = useSelector((state) => state.Settings.dataset);
  const { patient, cells, snv, signatures, cloneColors } = useSelector((state) => state.SingleCell);
  // events with the user's re-tiering applied; selectedEventUids is null until
  // "Add to report" is ticked in the Filtered Events table (then it decides the drivers)
  const events = useSelector((state) => selectMergedEvents(state).filteredEvents);
  const selectedUids = useSelector((state) => state.FilteredEvents.selectedEventUids);
  const { status, story } = useStory(dataset);
  const id = patient?.caseReportId;
  const portrait = usePatientPortrait(dataset, id);
  const portraitCohort = useCohortExport(dataset, "portrait.json");
  const clinical = useClinicalAssays(dataset);
  const { vignettes, cohort } = summaryStoryChapters(
    storyForPatient(story, id),
    id,
    sentencesAbout,
    t("components.single-cell.story.in-cohort"),
    t("components.single-cell.story.in-cohort-lede")
  );
  const storyItems = [];
  vignettes.forEach((v) =>
    storyItems.push(<StoryChapter key={v.id} section={v} groupColors={cloneColors} provenance={`story-${v.id.replace(/^[^-]+-/, "")}`} />)
  );
  if (cohort) storyItems.push(<StoryChapter key="cohort" section={cohort} provenance="story" />);
  return (
    <SingleCellWrapper>
      <ScEventModal />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <HelpDrawer />
      </div>
      <Card size="small" title="Clinical assay (de-identified)" style={{ marginBottom: 12 }}>
        <ClinicalStrip assays={clinical.assays} recovery={clinical.recovery} patient={id} status={clinical.status} />
      </Card>
      <VignetteWrapper>
        <PatientVignette />
      </VignetteWrapper>
      <Collapse
        size="small"
        style={{ marginTop: 16 }}
        defaultActiveKey={SUMMARY_DEFAULT_OPEN}
        items={[
          {
            key: "portrait",
            label: "Patient portrait: genotype, evolution, phenotype, canonical GBM biology vs novel",
            children: portrait.status === "loading" ? <Skeleton active /> : <PortraitCard bare portrait={portrait.data} patient={id} features={portraitCohort.data?.matrix?.features} />,
          },
          { key: "clonal-history", label: "Clonal history", children: <ClonalHistoryCard /> },
          { key: "notable-svs", label: "Notable structural variants: rDelDup, rDel, rDup, TIC, chromoplexy ... (non-ecDNA complex-SV families)", children: <NotableSvCard /> },
          { key: "event-order", label: "Event order: which complex events nest inside which", children: <ComplexOrderCard /> },
          {
            key: "timing-rates",
            label: "Amplicon timing and branch rates",
            children: (
              <>
                <AmpTimingCard />
                <div style={{ marginTop: 16 }}>
                  <BranchRatesCard />
                </div>
              </>
            ),
          },
          {
            key: "full-report",
            label: "Full driver report: all tier 1-2 drivers, clone table, burden, signatures, RNA findings",
            children: (
              <PatientReportCard
                patient={id}
                events={events || []}
                cells={cells}
                variants={snv.status === "ok" ? snv.data?.variants || [] : []}
                signatures={signatures.status === "ok" ? signatures.data : null}
                cloneColors={cloneColors}
                selectedUids={selectedUids}
                interactive
              />
            ),
          },
          {
            key: "story",
            label: t("components.single-cell.story.patient-title", { patient: id }),
            children: status === "loading" ? <Skeleton active /> : storyItems.length ? storyItems.map((c, i) => <div key={i} style={{ marginBottom: 12 }}>{c}</div>) : t("components.single-cell.story.none-patient"),
          },
        ]}
      />
    </SingleCellWrapper>
  );
}
