import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Alert, Card, Col, Row, Space, Tag, Typography } from "antd";
import { driverGenes } from "../../../helpers/singleCell/driverSummary";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { formatP } from "../../../helpers/singleCell/tests";
import { aseVerdict, expressionContrast, expressionHeadline, rnaAlleleCounts, rnaRows } from "../../../helpers/singleCell/driverExpression";
import { siteEvidence } from "../../../helpers/singleCell/precompute";
import { pcFile } from "../evidence/notComputed";
import { useAse } from "../rna/asePanel";
import { GeneDots } from "./driverExpressionCard";
import { CARRIER_COLOR, COMPARATOR_COLOR, OTHER_COLOR } from "./useDriverEvidence";

const { Text } = Typography;
const pct = (x) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "n/a");

/**
 * Per gene of the driver (both partners of a fusion): carriers vs the other (non-carrier) tumour cells, and vs
 * `comparator` when given. Values are log-normalised RNA of the cells that have RNA.
 * Returns [{ gene, found, groups, vsOthers, vsComparator }].
 */
export function useDriverGeneExpression(driver, carriers, nonCarriers, comparator, rna) {
  const { summary, matrix, rowOfId } = rna || {};
  return useMemo(() => {
    if (!driver || !summary || !matrix) return [];
    const A = rnaRows(carriers, rowOfId);
    const B = rnaRows(nonCarriers, rowOfId);
    const C = comparator ? rnaRows(comparator, rowOfId) : null;
    return driverGenes(driver.event).map((gene) => {
      const gi = summary.geneIndex?.get(gene) ?? summary.geneIndex?.get(`${gene}`.toUpperCase());
      if (gi == null) return { gene, found: false };
      const v = geneValues(matrix, summary.cells.length, gi);
      const vals = (rows) => rows.map(({ id, r }) => ({ id, v: v[r] }));
      const groups = [
        { key: "a", label: "Carriers", color: CARRIER_COLOR, values: vals(A) },
        { key: "b", label: "Other tumour cells", color: OTHER_COLOR, values: vals(B) },
        ...(C ? [{ key: "c", label: "Sister / comparator", color: COMPARATOR_COLOR, values: vals(C) }] : []),
      ];
      const arr = (g) => g.values.map((x) => x.v);
      return {
        gene,
        found: true,
        groups,
        vsOthers: expressionContrast(arr(groups[0]), arr(groups[1])),
        vsComparator: C ? expressionContrast(arr(groups[0]), arr(groups[2])) : null,
      };
    });
  }, [driver, summary, matrix, rowOfId, carriers, nonCarriers, comparator]);
}

/** Header line of the drawer (carriers vs other tumour cells), one sentence; empty without RNA. */
export function expressionLine(items) {
  return expressionHeadline((items || []).map((g) => ({ gene: g.gene, contrast: g.found ? g.vsOthers : null })));
}

const contrastText = (label, c) =>
  !c ? null : !c.ok ? `${label}: not available (${c.reason})` : (
    `${label}: mean log-norm ${c.a.mean.toFixed(2)} vs ${c.b.mean.toFixed(2)} (median ${c.a.median.toFixed(2)} vs ${c.b.median.toFixed(2)}) · detected ${pct(c.a.pctDetected)} vs ${pct(c.b.pctDetected)} · n ${c.a.n} vs ${c.b.n} · rank-sum ${formatP(c.pMW)}, detection Fisher ${formatP(c.pFisher)}`
  );

/** Allele-specific expression of an SNV: RNA alt / ref reads at the site in carriers vs other cells, plus the gene's haplotype ASE class. */
function AlleleBlock({ driver, siteId, carriers, nonCarriers, genes }) {
  const { precompute, cells } = useSelector((s) => s.SingleCell);
  const calls = pcFile(precompute, "calls");
  const ase = useAse();
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const verdict = useMemo(() => {
    if (!siteId || !calls.ok) return null;
    const rows = siteEvidence(calls.data, siteId, cloneOf);
    return aseVerdict(rnaAlleleCounts(rows, { carriers, others: nonCarriers }));
  }, [calls.ok, calls.data, siteId, cloneOf, carriers, nonCarriers]);
  let reason = null;
  if (!siteId) reason = "not an SNV site genotyped in this patient";
  else if (!calls.ok) reason = "site genotypes (region_calls) not computed for this patient";
  else if (!verdict) reason = "no RNA reads at this site in the carriers (RNA depth not recorded or zero)";
  const geneAse = ase.status === "ok" ? genes.map((g) => ase.data.byGene.get(g)).filter(Boolean) : [];
  return (
    <div data-testid="driver-ase">
      <Text strong>Allele-specific expression of the variant: </Text>
      {verdict ? (
        <Text>
          {`RNA reads in carriers: ${verdict.carriers.alt} alt / ${verdict.carriers.ref} ref (alt share ${pct(verdict.carriers.vaf)}, ${verdict.carriers.altCells} of ${verdict.carriers.cells} RNA-covered carriers show alt)`}
          {verdict.others ? `; other cells: ${verdict.others.alt} alt / ${verdict.others.ref} ref${Number.isFinite(verdict.p) ? ` (${formatP(verdict.p)})` : ""}` : ""}
        </Text>
      ) : (
        <Text type="secondary">{`not available (${reason})`}</Text>
      )}
      <div>
        {geneAse.length ? (
          geneAse.map((g) => (
            <Tag key={g.gene} color="blue">{`${g.gene} haplotype ASE: ${g.cls || "unclassified"} (RNA haplotype A share ${pct(g.rna)}, DNA expectation ${pct(g.dna)})`}</Tag>
          ))
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {`Gene-level haplotype ASE: not available (${ase.status === "ok" ? "gene not tested in rna/ase.json" : "no rna/ase.json for this patient"})`}
          </Text>
        )}
      </div>
    </div>
  );
}

/**
 * "Expression of <gene>" at the top of the driver drawer: strip plot of RNA-linked carriers vs other tumour cells
 * (and the chosen comparator), detection, mean, tests, n, and the allele-specific expression of the variant.
 */
export default function DriverGeneExpressionCard({ driver, carriers, nonCarriers, comparator, rna, siteId = null }) {
  const items = useDriverGeneExpression(driver, carriers, nonCarriers, comparator, rna);
  const genes = driverGenes(driver.event);
  const noRna = !rna?.summary;
  return (
    <Card size="small" title={`Expression of ${genes.join(" and ") || driver.label}`} data-testid="driver-gene-expression">
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {noRna ? (
          <Alert type="info" showIcon message="Expression: not available (no matched RNA for this patient)" />
        ) : !rna.matrix ? (
          <Text type="secondary">Loading the RNA matrix...</Text>
        ) : (
          <Row gutter={[12, 12]}>
            {items.map((it) => (
              <Col key={it.gene} xs={24} lg={items.length > 1 ? 12 : 14}>
                {it.found ? (
                  <>
                    <GeneDots gene={it.gene} groups={it.groups} row={null} />
                    <div style={{ fontSize: 12 }}>
                      {[contrastText("Carriers vs other tumour cells", it.vsOthers), contrastText("Carriers vs comparator", it.vsComparator)].filter(Boolean).map((t) => (
                        <div key={t}>
                          <Text type="secondary">{t}</Text>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Text type="secondary">{`${it.gene}: not available (gene is not in this patient's RNA matrix)`}</Text>
                )}
              </Col>
            ))}
          </Row>
        )}
        <AlleleBlock driver={driver} siteId={siteId} carriers={carriers} nonCarriers={nonCarriers} genes={genes} />
      </Space>
    </Card>
  );
}
