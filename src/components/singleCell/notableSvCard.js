import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Empty, Table, Tag, Tooltip, Typography } from "antd";
import useTreeView from "./useTreeView";
import settingsActions from "../../redux/settings/actions";
import singleCellActions from "../../redux/singleCell/actions";
import { buildDriverEntries } from "../../helpers/singleCell/driverLayer";
import { notableSvs } from "../../helpers/singleCell/notableSvs";

const { Text } = Typography;
const COLORS = { truncal: "#237804", subclonal: "#1d39c4", private: "#8c8c8c" };
const isNormal = (clone) => /^normal$/i.test(`${clone || ""}`);

export const NOTE = "Classifier families (gGnome events grouped by shared junctions), not validated structural variants. Clade placement is the best-matching tree clade for the carrier cells.";

/** Genes line: driver genes first; "not available" without the gene annotation. */
export const GenesText = ({ r }) =>
  r.genes == null ? <Text type="secondary">not available (gene annotation not loaded)</Text> : r.genes.length ? <span>{`${r.genes.join(", ")}${r.nGenes > r.genes.length ? ` +${r.nGenes - r.genes.length}` : ""}`}</span> : <Text type="secondary">none in the gOS gene track (well-cited genes only)</Text>;

/** Patient Summary: the non-DM complex-SV families (rDelDup, rDel, rDup, TIC, chromoplexy ...), click opens the Drivers drawer. */
export default function NotableSvCard() {
  const dispatch = useDispatch();
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const cells = useSelector((s) => s.SingleCell.cells);
  const genesList = useSelector((s) => s.Genes?.list || []);
  const { treeLayout, order: rowOrder } = useTreeView();
  const tumorIds = useMemo(() => {
    const normal = new Set((cells || []).filter((c) => isNormal(c.clone_id)).map((c) => `${c.cell_id}`));
    return (rowOrder || []).filter((id) => !normal.has(`${id}`));
  }, [cells, rowOrder]);
  const rows = useMemo(() => {
    const entries = buildDriverEntries(events || [], { tumorIds });
    return notableSvs(entries, { genesList: genesList.length ? genesList : null, treeLayout, tumorN: tumorIds.length });
  }, [events, tumorIds, genesList, treeLayout]);
  if (!rows.length) return <Empty description="No non-DM complex-SV family in this patient" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const open = (r) => {
    dispatch(singleCellActions.updateHeatmapType("drivers"));
    dispatch(singleCellActions.updateDriverDrawer(r.key));
    dispatch(settingsActions.updateTab("7"));
  };
  const columns = [
    { title: "Family", dataIndex: "label", render: (l, r) => <a onClick={() => open(r)}>{l}</a> },
    { title: "Member classifications", dataIndex: "members", render: (m) => <Text style={{ fontSize: 12 }}>{m}</Text> },
    { title: "Cells", width: 110, render: (_, r) => `${r.n}${r.fraction ? ` (${Math.round(100 * r.fraction)}%)` : ""}` },
    { title: "Clade", width: 170, render: (_, r) => (r.f1 != null ? <Tag color={COLORS[r.placement]}>{`${r.placement}, ${r.cladeSize} cells, F1 ${r.f1.toFixed(2)}`}</Tag> : <Text type="secondary">not available (no tree)</Text>) },
    { title: "Genes inside (drivers first)", render: (_, r) => <GenesText r={r} /> },
    { title: "ecDNA", width: 190, render: (_, r) => (r.ecdna ? <Tooltip title="The whole footprint lies inside the footprint of a DM family; overlap of calls, not proof the junction is on the ecDNA"><Tag color="purple">{`inside ${r.ecdna.label} (${r.ecdna.overlap}/${r.ecdna.carriers} cells)`}</Tag></Tooltip> : <Text type="secondary">no</Text>) },
  ];
  return (
    <div data-notable-svs>
      <Alert type="info" showIcon style={{ marginBottom: 8 }} message={NOTE} />
      <Table size="small" pagination={false} rowKey="key" dataSource={rows} columns={columns} />
    </div>
  );
}
