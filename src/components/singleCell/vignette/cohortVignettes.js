import React from "react";
import { useDispatch } from "react-redux";
import { Button, Empty, Skeleton, Space, Typography } from "antd";
import settingsActions from "../../../redux/settings/actions";
import { cohortVignetteRows, displayText, splitLead } from "../../../helpers/singleCell/vignettes";
import { requestEvidence } from "../../../helpers/singleCell/evidenceFocus";
import useVignettes from "./useVignettes";
import VignetteWrapper from "./vignette.style";
import { CloneLine, EvidenceChips, EvidenceDrawer, useEvidenceRunner } from "./patientVignette";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text, Link } = Typography;
const CATEGORY_LABEL = { truncal: "truncal", subclonal: "subclonal", rna: "RNA", phenotype: "phenotype" };
const IN_PLACE = new Set(["plot", "igv", "splice"]);

function CohortRow({ id, vignette, summary, cloneColors, onOpen, runInPlace }) {
  const dispatch = useDispatch();
  // in-place evidence opens here; jump-and-highlight evidence opens the patient, then runs there
  const onRun = (finding, index) => (action, title) => {
    if (IN_PLACE.has(action.type)) return runInPlace(action, title, id);
    requestEvidence({ kind: "vignette-run", patient: id, findingId: finding.id, index });
    if (summary) onOpen(summary);
    return null;
  };
  return (
    <div className="sc-vignette-cohort-row" data-patient={id}>
      <Space size={10} wrap style={{ marginBottom: 2 }}>
        <Link strong style={{ fontSize: TYPE.title }} onClick={() => summary && onOpen(summary)}>{id}</Link>
        <Text type="secondary" style={{ fontSize: TYPE.label }}>{`${vignette.nTumor} tumor cells · ${vignette.tree === "snv" ? "SNV tree" : "CN tree"}`}</Text>
        {summary && (
          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => { onOpen(summary); setTimeout(() => dispatch(settingsActions.updateTab("12")), 800); }}>
            Open report
          </Button>
        )}
      </Space>
      <ol>
        {vignette.findings.map((f, i) => {
          const { lead, rest } = splitLead(displayText(f));
          return (
            <li key={f.id} className={i < 3 && f.category !== "phenotype" ? "major" : undefined}>
              <Text type="secondary" className="sc-vignette-cat">{CATEGORY_LABEL[f.category]}</Text>
              {lead ? (
                <>
                  <Text strong={i < 3}>{`${lead}: `}</Text>
                  <Text>{rest}</Text>
                </>
              ) : (
                <Text strong={i < 3}>{displayText(f)}</Text>
              )}
              <div style={{ margin: "2px 0 4px" }}>
                <EvidenceChips finding={f} vignette={vignette} onRun={(action, title, k) => onRun(f, k)(action, title)} />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="sc-vignette-meta">
        <Text type="secondary" className="sc-vignette-metalabel">Clones</Text>
        <CloneLine vignette={vignette} cloneColors={cloneColors} />
      </div>
      <div className="sc-vignette-meta">
        <Text type="secondary" className="sc-vignette-metalabel">Caveats</Text>
        <Text type="secondary" style={{ fontSize: TYPE.label }}>{vignette.caveat}</Text>
      </div>
    </div>
  );
}

/**
 * Cohort "Key findings": every patient's vignette as a compact ranked list
 * (one sentence per finding with its numbers), the clone line and the caveat.
 * Evidence chips open plots / reads in place, or open the patient and jump
 * to the highlighted evidence there.
 */
export default function CohortVignettes({ dataset, summaries = [], cloneColors = {}, onOpen }) {
  const { status, vignettes } = useVignettes(dataset);
  const { run, drawer, closeDrawer } = useEvidenceRunner(null);
  if (status === "loading") return <Skeleton active />;
  if (!vignettes) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No vignettes.json for this dataset" />;
  const byId = new Map(summaries.map((s) => [`${s.caseReportId}`, s]));
  const rows = cohortVignetteRows(vignettes, summaries.map((s) => `${s.caseReportId}`));
  return (
    <VignetteWrapper>
      <Text type="secondary" style={{ display: "block", fontSize: TYPE.label, marginBottom: 4 }}>
        {`Ranked findings per patient from vignettes.json (${vignettes.generated || "undated"}). Chips: plots and reads open here; heatmap, tree, ecDNA and driver evidence opens the patient on that view.`}
      </Text>
      {rows.map(({ id, vignette }) => (
        <CohortRow key={id} id={id} vignette={vignette} summary={byId.get(id)} cloneColors={cloneColors} onOpen={onOpen} runInPlace={run} />
      ))}
      <EvidenceDrawer drawer={drawer} onClose={closeDrawer} />
    </VignetteWrapper>
  );
}
