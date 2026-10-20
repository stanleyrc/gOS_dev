import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Empty, Table, Tag, Tooltip, Typography } from "antd";
import useTreeView from "./useTreeView";
import settingsActions from "../../redux/settings/actions";
import singleCellActions from "../../redux/singleCell/actions";
import { buildDriverEntries } from "../../helpers/singleCell/driverLayer";
import { notableSvs } from "../../helpers/singleCell/notableSvs";
import { GENE_SPANS_MISSING } from "../../helpers/singleCell/geneSpans";
import useGeneSpans from "./cohort/useGeneSpans";
import { EcdnaStatusChip, useEcdnaStatus } from "./ecdnaStatusChip";
import { statusForEvent } from "../../helpers/singleCell/ecdnaStatus";

const { Text } = Typography;
const COLORS = { truncal: "#237804", subclonal: "#1d39c4", private: "#8c8c8c" };
const isNormal = (clone) => /^normal$/i.test(`${clone || ""}`);

export const NOTE = "Classifier families (gGnome events grouped by shared junctions), not validated structural variants. Clade placement is the best-matching tree clade for the carrier cells.";

/** Genes line: driver genes first. Whole-GENCODE spans when gene_spans.json is exported, else the gOS gene track (and says so). */
export const GenesText = ({ r }) => {
  if (r.genes == null) return <Text type="secondary">not available (gene annotation not loaded; {GENE_SPANS_MISSING})</Text>;
  const note = r.genesSource === "track" ? <Text type="secondary" style={{ fontSize: 11 }}>{` (${GENE_SPANS_MISSING}; gOS gene track only)`}</Text> : null;
  if (!r.genes.length) return <Text type="secondary">{r.genesSource === "spans" ? "no protein-coding gene" : "none in the gOS gene track (well-cited genes only)"}{note}</Text>;
  return <span>{`${r.genes.join(", ")}${r.nGenes > r.genes.length ? ` (+${r.nGenes - r.genes.length} more)` : ""}`}{note}</span>;
};

/** Patient Summary: the complex-SV families, ecDNA first, then rDelDup, rDel, rDup, TIC, chromoplexy ...; click opens the Drivers drawer. */
export default function NotableSvCard() {
  const dispatch = useDispatch();
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const cells = useSelector((s) => s.SingleCell.cells);
  const genesList = useSelector((s) => s.Genes?.list || []);
  const { spans: geneSpans } = useGeneSpans();
  const { treeLayout, order: rowOrder } = useTreeView();
  const ecStatus = useEcdnaStatus();
  const tumorIds = useMemo(() => {
    const normal = new Set((cells || []).filter((c) => isNormal(c.clone_id)).map((c) => `${c.cell_id}`));
    return (rowOrder || []).filter((id) => !normal.has(`${id}`));
  }, [cells, rowOrder]);
  const rows = useMemo(() => {
    const entries = buildDriverEntries(events || [], { tumorIds });
    return notableSvs(entries, { geneSpans, genesList: genesList.length ? genesList : null, treeLayout, tumorN: tumorIds.length });
  }, [events, tumorIds, genesList, geneSpans, treeLayout]);
  if (!rows.length) return <Empty description="No complex-SV family in this patient" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const open = (r) => {
    dispatch(singleCellActions.updateHeatmapType("drivers"));
    dispatch(singleCellActions.updateDriverDrawer(r.key));
    dispatch(settingsActions.updateTab("7"));
  };
  const columns = [
    { title: "Family", dataIndex: "label", render: (l, r) => <a onClick={() => open(r)}>{l}</a> },
    {
      title: <Tooltip title="Segregation call from per-cell CN dispersion within tree clades (ecdna_status.json), shown for gGnome ecDNA (DM / Cpxdm) families">ecDNA status</Tooltip>,
      width: 200,
      render: (_, r) => (r.isEcdna ? <EcdnaStatusChip status={ecStatus.status === "ok" ? statusForEvent(ecStatus.data, r.entry) : null} missing={ecStatus.status === "missing"} /> : null),
    },
    { title: "Member classifications", dataIndex: "members", render: (m) => <Text style={{ fontSize: 12 }}>{m}</Text> },
    { title: "Cells", width: 110, render: (_, r) => `${r.n}${r.fraction ? ` (${Math.round(100 * r.fraction)}%)` : ""}` },
    { title: "Clade", width: 170, render: (_, r) => (r.f1 != null ? <Tag color={COLORS[r.placement]}>{`${r.placement}, ${r.cladeSize} cells, F1 ${r.f1.toFixed(2)}`}</Tag> : <Text type="secondary">not available (no tree)</Text>) },
    { title: "Genes inside (drivers first)", render: (_, r) => <GenesText r={r} /> },
    { title: "ecDNA", width: 190, render: (_, r) => (r.ecdna ? <Tooltip title="The whole footprint lies inside the footprint of an ecDNA (gGnome DM) family; overlap of calls, not proof the junction is on the ecDNA"><Tag color="purple">{`inside ${r.ecdna.label} (${r.ecdna.overlap}/${r.ecdna.carriers} cells)`}</Tag></Tooltip> : <Text type="secondary">no</Text>) },
  ];
  return (
    <div data-notable-svs>
      <Alert type="info" showIcon style={{ marginBottom: 8 }} message={NOTE} />
      <Table size="small" pagination={false} rowKey="key" dataSource={rows} columns={columns} />
    </div>
  );
}
