import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Tag, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { GeneInfoContent, useGeneSummaries } from "../geneInfoPopover";
import useCohortExport from "../cohort/useCohortExport";
import { DEPMAP_FILE, DEPMAP_MISSING, depLines, geneCardData, parseDepmap } from "../../../helpers/singleCell/paperGenes";

const { Text, Link } = Typography;

/** { status, dm } from _cohort/depmap_amplicon_genes.json (null dm when not exported). */
export function useDepmap() {
  const dataset = useSelector((s) => s.Settings?.dataset);
  const { status, data } = useCohortExport(dataset?.dataPath ? dataset : null, DEPMAP_FILE);
  const dm = useMemo(() => parseDepmap(data), [data]);
  return { status: status === "ok" && !dm ? "none" : status, dm };
}

/**
 * Gene card opened from a figure: the shared gene summary card (summary, OncoKB badges, GeneCards / NCBI / UniProt / OncoKB links)
 * plus our data (patients whose amplicon walks carry the gene, DepMap Chronos). Floating at the click; Escape or x closes it.
 */
export default function FigureGeneCard({ gene, genes = [], anchor, onPick, onClose }) {
  const summaries = useGeneSummaries();
  const { status, dm } = useDepmap();
  const data = useMemo(() => geneCardData(dm, gene), [dm, gene]);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;
    const x = anchor ? Math.min(Math.max(8, anchor.x + 14), vw - 440) : vw - 450;
    const y = anchor ? Math.min(Math.max(8, anchor.y - 20), vh - 360) : 80;
    setPos({ x, y });
  }, [anchor, gene]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!gene || !pos) return null;
  const lines = depLines(data.dep, dm?.release);
  return (
    <div
      className="sc-figgene-card"
      role="dialog"
      aria-label={`Gene card ${gene}`}
      style={{ position: "fixed", left: pos.x, top: pos.y, width: 430, maxHeight: "80vh", overflow: "auto", zIndex: 1100, background: "var(--sc-card-bg, #fff)", color: "var(--sc-card-fg, inherit)", border: "1px solid rgba(128,128,128,0.45)", borderRadius: 6, boxShadow: "0 6px 20px rgba(0,0,0,0.25)", padding: "8px 10px 8px" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button type="text" size="small" icon={<CloseOutlined />} aria-label="Close gene card" onClick={onClose} style={{ position: "absolute", right: 4, top: 4 }} />
      {genes.length > 1 && (
        <div style={{ marginBottom: 4, fontSize: 11 }}>
          <Text type="secondary">{"Also here: "}</Text>
          {genes.filter((g) => g !== gene).map((g) => (
            <Tag key={g} style={{ cursor: "pointer", fontSize: 11 }} onClick={() => onPick && onPick(g)}>
              {g}
            </Tag>
          ))}
        </div>
      )}
      <GeneInfoContent gene={gene} summaries={summaries} />
      <div style={{ borderTop: "1px solid rgba(128,128,128,0.3)", marginTop: 6, paddingTop: 5, fontSize: 12 }}>
        <Text strong style={{ fontSize: 12 }}>
          In our data
        </Text>
        {status === "loading" ? (
          <div>
            <Text type="secondary">Loading…</Text>
          </div>
        ) : !dm ? (
          <div>
            <Text type="secondary">{`Amplicon membership and DepMap Chronos ${DEPMAP_MISSING}`}</Text>
          </div>
        ) : (
          <>
            <div>
              {data.patients.length ? (
                <>
                  <Text>{"On an amplicon walk (>= 3 cells) in: "}</Text>
                  {data.patients.map((p) => (
                    <Tag key={p.patient} color={p.driverWalk ? "red" : "default"} style={{ fontSize: 11 }} title={p.driverWalk ? "walk also carries a known driver gene" : undefined}>
                      {`${p.patient}${p.cells != null ? ` · up to ${p.cells} cells` : ""}`}
                    </Tag>
                  ))}
                </>
              ) : (
                <Text type="secondary">Not on any amplicon walk carried by >= 3 cells in this cohort</Text>
              )}
            </div>
            {lines.length ? (
              lines.map((l) => (
                <div key={l.key}>
                  <Text style={{ fontSize: 11 }}>{l.text}</Text>
                </div>
              ))
            ) : (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {data.patients.length ? `DepMap Chronos not available (${gene} has no gene-effect profile in ${dm.release || "DepMap"})` : `DepMap Chronos shown for amplicon genes only (${gene} is not in the exported set)`}
                </Text>
              </div>
            )}
            {dm.release && (
              <Link href="https://depmap.org/portal/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
                {`${dm.release} (DepMap portal)`}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
