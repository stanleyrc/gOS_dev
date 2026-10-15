import React, { useEffect, useState } from "react";
import { Skeleton, Space, Typography } from "antd";
import Violins from "../violins";
import useCohortExport from "./useCohortExport";
import { loadRna } from "./cohortRnaPanel";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { violinGroups } from "../../../helpers/singleCell/covariateDe";
import { COLOR_DOWN, COLOR_UP } from "../rna/volcanoPlot";

const { Text } = Typography;

/**
 * Expression violins of one gene for a covariate test: per patient, group A vs group B, the cells the test used
 * (malignant tumour cells; indices from _cohort/rna_covariate_de_cells.json). Expression is loaded the way the other
 * cohort RNA views do (loadRna + loadRnaMatrix); a patient that cannot be loaded is listed with the reason.
 */
export default function CovariateDeViolins({ dataset, test, gene, summaries = [], datasets = [] }) {
  const { status, data: cellsDoc } = useCohortExport(dataset, "rna_covariate_de_cells.json");
  const [state, setState] = useState({ loading: true, perPatient: [] });
  useEffect(() => {
    let active = true;
    if (!test || !gene) return undefined;
    if (status === "loading") return undefined;
    setState({ loading: true, perPatient: [] });
    (async () => {
      const out = [];
      for (const p of test.patients) {
        const idx = cellsDoc?.tests?.[test.id]?.[p.patient];
        const summary = summaries.find((s) => `${s.caseReportId}` === `${p.patient}`);
        const ds = summary && datasets.find((d) => `${d.id}` === `${summary.record.datasetId}`);
        if (!idx) {
          out.push({ patient: p.patient, reason: cellsDoc ? "cells of this test are not in rna_covariate_de_cells.json" : "rna_covariate_de_cells.json not found" });
          continue;
        }
        if (!ds) {
          out.push({ patient: p.patient, reason: "patient dataset not loaded in this session" });
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const rna = await loadRna(ds, p.patient);
          const sm = rna?.summary;
          const gi = sm ? sm.geneIndex.get(gene) ?? sm.geneIndex.get(gene.toUpperCase()) : null;
          if (!sm) out.push({ patient: p.patient, reason: "rna/cells.json missing" });
          else if (gi == null) out.push({ patient: p.patient, reason: `${gene} is not in this patient's expression matrix` });
          else {
            // eslint-disable-next-line no-await-in-loop
            const matrix = await loadRnaMatrix(ds, p.patient);
            out.push({ patient: p.patient, values: geneValues(matrix, sm.cells.length, gi), a: idx.a, b: idx.b });
          }
        } catch (error) {
          out.push({ patient: p.patient, reason: `matrix could not be loaded (${error?.message || "error"})` });
        }
      }
      if (active) setState({ loading: false, perPatient: out });
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test?.id, gene, status, cellsDoc, summaries.length, datasets.length]);

  if (state.loading) return <Skeleton active paragraph={{ rows: 3 }} />;
  const { groups, unavailable } = violinGroups(state.perPatient, { colorA: COLOR_UP, colorB: COLOR_DOWN, labelA: "A", labelB: "B" });
  return (
    <div>
      <Text strong>{`${gene} expression`}</Text>
      <Text type="secondary">{` · per patient, ${test.group_a} (A, red) vs ${test.group_b} (B, blue); malignant tumour cells the test used; log-normalized`}</Text>
      {groups.length > 0 && <Violins groups={groups} height={260} yTitle={`${gene} (log-normalized)`} showDetected />}
      {unavailable.length > 0 && (
        <Space direction="vertical" size={0} style={{ display: "flex", marginTop: 4 }}>
          {unavailable.map((u) => <Text key={u.patient} type="secondary">{`${u.patient}: not available (${u.reason})`}</Text>)}
        </Space>
      )}
    </div>
  );
}
