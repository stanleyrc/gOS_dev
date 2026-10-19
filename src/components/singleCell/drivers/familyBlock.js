import React from "react";
import { useDispatch } from "react-redux";
import { Button, Space, Tag, Typography } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import { classificationText, familyLinkLines } from "../../../helpers/singleCell/complexFamilies";
import { genesInside, genesInsideText, GENE_SPANS_MISSING } from "../../../helpers/singleCell/geneSpans";
import useGeneSpans from "../cohort/useGeneSpans";

const { Text } = Typography;
const MAX_JUNCTIONS = 12;

/**
 * Drawer block of a complex-SV family entry: the rule (read from event_families.json, not assumed), the member
 * classifications with cell counts, a "show carriers" action per member and the junction ids with the number of
 * cells whose JaBbA graph carries each.
 */
export default function FamilyBlock({ entry, files }) {
  const dispatch = useDispatch();
  const { spans } = useGeneSpans();
  const fam = entry?.family;
  if (!fam) return null;
  const file = files?.families?.status === "ok" ? files.families.data : null;
  const identity = files?.identity?.status === "ok" ? files.identity.data : null;
  const rule = file ? `rule: ${file.family_rule}${file.rules?.link ? ` (${file.rules.link})` : ""}` : "rule: not available (event_families.json not loaded)";
  const dm = /^(dm|cpxdm)$/i.test(`${fam.dominant.vartype}`);
  const ids = fam.junctionIds || [];
  const fileFam = file?.families?.find((f) => f.family_id === fam.id) || null;
  const { lines, weak } = familyLinkLines(fileFam);
  return (
    <div style={{ marginBottom: 10 }} data-driver-family>
      <Space wrap size={6}>
        <Tag color="purple">{`member of ${fam.id}${dm ? " (ecDNA family)" : ""}`}</Tag>
        <Text strong>{`${entry.n} cells, ${fam.members.length} per-cell classifications`}</Text>
        <Text type="secondary">{rule}</Text>
      </Space>
      <div style={{ marginTop: 4 }}>
        <Text type="secondary">{`Classifications: ${classificationText(fam.classifications)}.`}</Text>
      </div>
      <div style={{ marginTop: 4 }}>
        {fam.members.map((m, i) => (
          <Button key={`${m.Variant}-${i}`} size="small" type="link" onClick={() => dispatch(singleCellActions.updateSelection(`${m.cell_ids || ""}`.split(",").filter(Boolean)))}>
            {`show carriers: ${m.Variant || m.vartype} (${`${m.cell_ids || ""}`.split(",").filter(Boolean).length})${weak.has(m.Variant) ? " - attached, <3 cells" : ""}`}
          </Button>
        ))}
      </div>
      {lines.length > 0 && (
        <div style={{ marginTop: 4 }} data-family-links>
          <Text type="secondary">{`${lines.length} links between members:`}</Text>
          <ul style={{ margin: "2px 0 0 18px", padding: 0, fontSize: 12 }}>
            {lines.slice(0, 12).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
            {lines.length > 12 && <li>{`+${lines.length - 12} more`}</li>}
          </ul>
        </div>
      )}
      <div style={{ marginTop: 4 }}>
        <Text type="secondary">
          {ids.length
            ? `${ids.length} junction ids: ${ids
                .slice(0, MAX_JUNCTIONS)
                .map((j) => `${j}${identity?.junctions?.[j]?.n_cells_graph != null ? ` (${identity.junctions[j].n_cells_graph} cells)` : ""}`)
                .join("; ")}${ids.length > MAX_JUNCTIONS ? `; +${ids.length - MAX_JUNCTIONS} more` : ""}`
            : "Junction ids: not available"}
        </Text>
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>{`Family footprint: ${fam.footprint}`}</Text>
      <div style={{ marginTop: 4 }} data-family-genes>
        <Text type="secondary">{`genes inside: ${spans ? genesInsideText(genesInside(spans, fam.footprint, { max: 8 })) : GENE_SPANS_MISSING}`}</Text>
      </div>
    </div>
  );
}
