import React from "react";
import { useDispatch } from "react-redux";
import { Button, Card, Empty, Skeleton, Space, Tag, Typography } from "antd";
import settingsActions from "../../../redux/settings/actions";
import { cohortVignetteRows, displayText, splitLead } from "../../../helpers/singleCell/vignettes";
import { requestEvidence } from "../../../helpers/singleCell/evidenceFocus";
import useVignettes from "./useVignettes";
import VignetteWrapper from "./vignette.style";
import { CloneLine, EvidenceChips, EvidenceDrawer, useEvidenceRunner } from "./patientVignette";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import useCohortExport from "../cohort/useCohortExport";
import { headlineFindings } from "../../../helpers/singleCell/covariateDe";
import CladeF1Chip from "../cohort/cladeF1Chip";
import { findingF1 } from "../../../helpers/singleCell/cladeF1View";

const { Text, Link } = Typography;
const CATEGORY_LABEL = { truncal: "truncal", subclonal: "subclonal", rna: "RNA", phenotype: "phenotype" };
const IN_PLACE = new Set(["plot", "igv", "splice"]);

function CohortRow({ id, vignette, summary, cloneColors, onOpen, runInPlace, patientFiles = null }) {
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
              <CladeF1Chip value={findingF1(f, patientFiles?.events, patientFiles?.tree)} style={{ marginRight: 6 }} tip="Carriers of this finding's filtered events on the patient tree" />
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
 * Headline cards of the cross-patient RNA covariate differential (_cohort/rna_covariate_de.json): the few tests whose genes
 * move the same way in every patient that carries the covariate (q < 0.05). Each card opens the Covariate DE view on it.
 */
function CovariateHeadlines({ dataset, onOpen }) {
  const { data } = useCohortExport(dataset, "rna_covariate_de.json");
  const cards = React.useMemo(() => headlineFindings(data, { max: 5 }), [data]);
  if (!cards.length) return null;
  return (
    <div className="sc-cov-headlines" style={{ marginBottom: 12 }}>
      <Text strong style={{ display: "block", fontSize: TYPE.title, marginBottom: 4 }}>Cohort RNA differential: replicated findings</Text>
      <Text type="secondary" style={{ display: "block", fontSize: TYPE.label, marginBottom: 6 }}>
        Genes that change the same way in every patient tested (2+ patients, q &lt; 0.05, |log2FC| &gt;= 0.5), malignant tumour cells only, with plate, cycling and library quality controlled inside each patient.
      </Text>
      <Space size={[10, 10]} wrap align="start">
        {cards.map((c) => (
          <Card key={c.id} size="small" hoverable style={{ width: 340 }} onClick={() => onOpen && c.test && onOpen(c.id)}
            title={<Space size={6}><Tag color={c.family === "driver" ? "volcano" : c.family === "clade" ? "geekblue" : c.family === "shared" ? "gold" : "default"} style={{ margin: 0 }}>{c.family === "driver" ? "driver" : c.family === "clade" ? "clade" : c.family === "shared" ? "shared" : "copy number"}</Tag><span style={{ fontSize: TYPE.label }}>{c.title}</span></Space>}>
            <Text style={{ fontSize: TYPE.label }}>{c.text}</Text>
            {c.also.length > 0 && <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: TYPE.tick }}>{`Same genes also called by ${c.also.slice(0, 6).join(", ")}${c.also.length > 6 ? ` and ${c.also.length - 6} more` : ""} (carriers share a clade).`}</Text></div>}
            {c.note && <div style={{ marginTop: 4 }}><Text type="warning" style={{ fontSize: TYPE.tick }}>{c.note}</Text></div>}
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: TYPE.tick }}>{`${c.patients.join(", ")}${c.control ? " · dosage test: partly cis, read as a control" : ""}`}</Text>
            </div>
          </Card>
        ))}
      </Space>
    </div>
  );
}

/**
 * Cohort "Key findings": every patient's vignette as a compact ranked list
 * (one sentence per finding with its numbers), the clone line and the caveat.
 * Evidence chips open plots / reads in place, or open the patient and jump
 * to the highlighted evidence there.
 */
export default function CohortVignettes({ dataset, summaries = [], files = {}, cloneColors = {}, onOpen, onOpenCovariateDe }) {
  const { status, vignettes } = useVignettes(dataset);
  const { run, drawer, closeDrawer } = useEvidenceRunner(null);
  if (status === "loading") return <Skeleton active />;
  if (!vignettes) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No vignettes.json for this dataset" />;
  const byId = new Map(summaries.map((s) => [`${s.caseReportId}`, s]));
  const rows = cohortVignetteRows(vignettes, summaries.map((s) => `${s.caseReportId}`));
  return (
    <VignetteWrapper>
      <CovariateHeadlines dataset={dataset} onOpen={onOpenCovariateDe} />
      <Text type="secondary" style={{ display: "block", fontSize: TYPE.label, marginBottom: 4 }}>
        {`Ranked findings per patient from vignettes.json (${vignettes.generated || "undated"}). Chips: plots and reads open here; heatmap, tree, ecDNA and driver evidence opens the patient on that view.`}
      </Text>
      {rows.map(({ id, vignette }) => (
        <CohortRow key={id} id={id} vignette={vignette} summary={byId.get(id)} cloneColors={cloneColors} onOpen={onOpen} runInPlace={run} patientFiles={files[id] || null} />
      ))}
      <EvidenceDrawer drawer={drawer} onClose={closeDrawer} />
    </VignetteWrapper>
  );
}
