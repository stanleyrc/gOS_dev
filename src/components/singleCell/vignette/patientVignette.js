import React, { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Card, Drawer, Empty, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { AimOutlined, ApartmentOutlined, BarChartOutlined, FileSearchOutlined, NodeIndexOutlined, ProfileOutlined, SelectOutlined, ShareAltOutlined, TableOutlined } from "@ant-design/icons";
import settingsActions from "../../../redux/settings/actions";
import filteredEventsActions from "../../../redux/filteredEvents/actions";
import { driverKey } from "../../../helpers/singleCell/driverContrast";
import singleCellActions from "../../../redux/singleCell/actions";
import { locationToDomains } from "../../../helpers/utility";
import { evidenceAction, groupCells, splitLead } from "../../../helpers/singleCell/vignettes";
import { requestEvidence } from "../../../helpers/singleCell/evidenceFocus";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { findingIgvView, normalizeSpliceFindings } from "../../../helpers/singleCell/rnaHeadlineFindings";
import CellIgvPanel from "../cellIgvPanel";
import VignettePlot from "./vignettePlot";
import useVignettes from "./useVignettes";
import ColorTag from "../colorTag";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;

const ICONS = { cn: AimOutlined, cells: SelectOutlined, walk: ShareAltOutlined, igv: FileSearchOutlined, driver: NodeIndexOutlined, event: ProfileOutlined, expr: BarChartOutlined, splice: FileSearchOutlined, tab: TableOutlined };
const CATEGORY_LABEL = { truncal: "truncal", subclonal: "subclonal", rna: "RNA", phenotype: "phenotype" };

/** Run an evidence action: in-place ones open the drawer (setDrawer), the others dispatch and switch tabs. */
export function useEvidenceRunner(patientId) {
  const dispatch = useDispatch();
  const { chromoBins } = useSelector((s) => s.Settings);
  const dataset = useSelector((s) => s.Settings.dataset);
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const [drawer, setDrawer] = useState(null); // { title, content: { type, ... } }
  const run = useCallback(
    async (action, title, patientOverride = null) => {
      if (!action) return;
      const pid = patientOverride || patientId;
      if (action.type === "zoom") {
        try {
          const domains = locationToDomains(chromoBins, action.location, { clampRanges: true });
          if (domains) dispatch(settingsActions.updateDomains(domains));
        } catch (error) {
          // bad coordinates: only select
        }
        if (action.select?.length) dispatch(singleCellActions.updateSelection(action.select));
        dispatch(settingsActions.updateTab(action.tab));
      } else if (action.type === "select") {
        dispatch(singleCellActions.updateSelection(action.select));
        dispatch(settingsActions.updateTab(action.tab));
      } else if (action.type === "walks") {
        requestEvidence({ kind: "walks", patient: pid, walks: action.walks });
        dispatch(settingsActions.updateTab(action.tab));
      } else if (action.type === "driver") {
        dispatch(singleCellActions.updateDriverFocus(action.key));
        dispatch(settingsActions.updateTab(action.tab));
      } else if (action.type === "tab") {
        dispatch(settingsActions.updateTab(action.tab));
      } else if (action.type === "event") {
        const event = (events || []).find((e) => driverKey(e) === action.key);
        if (event) dispatch(filteredEventsActions.selectFilteredEvent(event, "plots"));
        else setDrawer({ title, content: { type: "none", text: `Event ${action.key} is not in the loaded filtered events.` } });
      } else if (action.type === "igv") {
        setDrawer({ title, content: { type: "igv", view: action.view } });
      } else if (action.type === "plot") {
        setDrawer({ title, content: { type: "plot", plot: action.plot } });
      } else if (action.type === "splice") {
        setDrawer({ title, content: { type: "loading" } });
        const r = dataset ? await tryGet(casePath(dataset, pid, "rna/splicing.json")).catch(() => ({ status: "error" })) : { status: "missing" };
        const f = r.status === "ok" ? normalizeSpliceFindings(r.data?.findings).find((x) => x.id === action.findingId) : null;
        const view = f ? findingIgvView(f, r.data?.splice_reads || {}, pid, 8) : null;
        setDrawer({ title, content: view ? { type: "igv", view, text: f.text } : { type: "none", text: f ? `${f.text} (no per-cell RNA slices exported for its cells)` : "Splicing finding not found in rna/splicing.json." } });
      }
    },
    [dispatch, chromoBins, dataset, patientId, events]
  );
  return { run, drawer, closeDrawer: () => setDrawer(null) };
}

/** Evidence chips of one finding; `onRun(action, title)`. */
export function EvidenceChips({ finding, vignette, onRun, size = "small" }) {
  return (
    <Space size={4} wrap>
      {finding.evidence.map((e, k) => {
        const action = evidenceAction(e, finding, vignette);
        if (!action) return null;
        const Icon = ICONS[e.kind] || FileSearchOutlined;
        const n = e.cells ? groupCells(vignette, e.cells).length : 0;
        const help = { cn: "CN heatmap zoomed to the region, carriers selected", cells: "Select these cells on the tree and heatmap", walk: "ecDNA tab with these walks drawn and highlighted", igv: "Reads of up to 6 carrier cells (opens here)", driver: "Drivers tab: carriers vs matched non-carriers", event: "The event's detail popup (variant, cells, QC)", expr: "Expression plot behind the numbers (opens here)", splice: "RNA reads at the junction (opens here)", tab: "Open the tab" }[e.kind];
        return (
          <Tooltip key={`${e.kind}${k}`} title={`${help}${n ? ` · ${n} cells` : ""}`}>
            <Button size={size} className="sc-evidence-chip" icon={<Icon />} onClick={() => onRun(action, `${finding.short || finding.genes[0] || ""} · ${e.label}`, k)}>
              {e.label}
            </Button>
          </Tooltip>
        );
      })}
    </Space>
  );
}

function FindingRow({ finding, vignette, onRun, major }) {
  const { lead, rest } = splitLead(finding.text);
  return (
    <li className={`sc-vignette-finding${major ? " major" : ""}`} data-finding={finding.id}>
      <div style={{ fontSize: TYPE.body, lineHeight: 1.5 }}>
        <Text type="secondary" className="sc-vignette-cat">{CATEGORY_LABEL[finding.category]}</Text>
        {lead ? (
          <>
            <Text strong>{`${lead}: `}</Text>
            <Text>{rest}</Text>
          </>
        ) : (
          <Text strong={major}>{finding.text}</Text>
        )}
      </div>
      {onRun && (
        <div style={{ marginTop: 3 }}>
          <EvidenceChips finding={finding} vignette={vignette} onRun={(action, title) => onRun(action, title)} />
        </div>
      )}
    </li>
  );
}

export function EvidenceDrawer({ drawer, onClose }) {
  return (
    <Drawer open={Boolean(drawer)} onClose={onClose} width={drawer?.content?.type === "igv" ? 920 : 480} title={drawer?.title} destroyOnClose>
      {drawer?.content?.type === "loading" && <Skeleton active />}
      {drawer?.content?.type === "plot" && <VignettePlot plot={drawer.content.plot} />}
      {drawer?.content?.type === "igv" && (
        <>
          {drawer.content.text && <Text style={{ display: "block", marginBottom: 8 }}>{drawer.content.text}</Text>}
          <CellIgvPanel view={drawer.content.view} embedded />
        </>
      )}
      {drawer?.content?.type === "none" && <Text type="secondary">{drawer.content.text}</Text>}
    </Drawer>
  );
}

/** Clone structure: one compact line, clone chips select the clone. */
export function CloneLine({ vignette, cloneColors = {}, onRun = null }) {
  if (!vignette.clones.list.length) return <Text type="secondary">{vignette.clones.text}</Text>;
  const tail = vignette.clones.text.split(" · ").filter((s) => !vignette.clones.list.some((c) => s.startsWith(`${c.clone} (`)));
  return (
    <div style={{ fontSize: TYPE.label, lineHeight: 1.9 }}>
      {vignette.clones.list.map((c) => (
        <span key={c.clone} style={{ marginRight: 14, whiteSpace: "nowrap" }}>
          <ColorTag
            color={cloneColors[c.clone]}
            style={{ cursor: onRun && c.cells ? "pointer" : undefined, marginRight: 4 }}
            onClick={onRun && c.cells ? () => onRun({ type: "select", tab: "7", select: groupCells(vignette, c.cells) }) : undefined}
          >
            {`${c.clone} · ${c.n}`}
          </ColorTag>
          <Text type={c.defining.length ? undefined : "secondary"}>{c.defining.length ? c.defining.join(", ") : "no defining event"}</Text>
        </span>
      ))}
      {tail.length > 0 && <Text type="secondary">{tail.join(" · ")}</Text>}
    </div>
  );
}

/**
 * The open patient's vignette: ranked one-sentence findings with evidence
 * chips (one click each: in-place drawer or jump-and-highlight), the clone
 * structure and the caveat line. Data: <dataPath>_cohort/vignettes.json.
 */
export default function PatientVignette({ patientId = null }) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const { patient, cloneColors } = useSelector((s) => s.SingleCell);
  const id = patientId || patient?.caseReportId;
  const { status, vignettes } = useVignettes(dataset);
  const { run, drawer, closeDrawer } = useEvidenceRunner(id);
  const vignette = vignettes?.patients?.[id] || null;

  if (status === "loading") return <Skeleton active paragraph={{ rows: 4 }} />;
  if (!vignette) return status === "ok" ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No vignette for ${id}`} /> : null;
  return (
    <Card
      size="small"
      className="sc-vignette"
      title={
        <Space size={8}>
          <ApartmentOutlined />
          <span>{`${id} in brief`}</span>
          <Text type="secondary" style={{ fontWeight: 400, fontSize: TYPE.label }}>{`${vignette.nTumor} tumor cells · ${vignette.findings.length} findings, ranked`}</Text>
        </Space>
      }
      extra={vignettes.generated && <Text type="secondary" style={{ fontSize: TYPE.tick }}>{`vignettes.json ${vignettes.generated}`}</Text>}
    >
      <ol className="sc-vignette-list">
        {vignette.findings.map((f, i) => (
          <FindingRow key={f.id} finding={f} vignette={vignette} onRun={run} major={i < 3 && f.category !== "phenotype"} />
        ))}
      </ol>
      <div className="sc-vignette-meta">
        <Tag bordered={false} className="sc-vignette-metatag">Clones</Tag>
        <CloneLine vignette={vignette} cloneColors={cloneColors} onRun={run} />
      </div>
      <div className="sc-vignette-meta">
        <Tag bordered={false} className="sc-vignette-metatag">Caveats</Tag>
        <Text type="secondary" style={{ fontSize: TYPE.label }}>{vignette.caveat}</Text>
      </div>
      <EvidenceDrawer drawer={drawer} onClose={closeDrawer} />
    </Card>
  );
}
