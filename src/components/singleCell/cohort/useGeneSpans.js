import { useMemo } from "react";
import { useSelector } from "react-redux";
import useCohortExport from "./useCohortExport";
import { GENE_SPANS_FILE, parseGeneSpans } from "../../../helpers/singleCell/geneSpans";

/** { status: "loading" | "ok" | "none", spans } from _cohort/gene_spans.json; spans is null while loading or when the file is not exported. */
export default function useGeneSpans(datasetProp = null) {
  const settingsDataset = useSelector((s) => s.Settings?.dataset);
  const dataset = datasetProp || settingsDataset;
  const { status, data } = useCohortExport(dataset?.dataPath ? dataset : null, GENE_SPANS_FILE);
  const spans = useMemo(() => parseGeneSpans(data), [data]);
  return { status: status === "ok" && !spans ? "none" : status, spans };
}
