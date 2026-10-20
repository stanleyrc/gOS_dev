import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Select } from "antd";
import settingsActions from "../../redux/settings/actions";
import { searchGeneOptions, pickedSpans, domainsForSpans, sameDomains } from "../../helpers/genes/geneSearch";

/**
 * Gene search for the gene track (same index as the genome browser's gene locator: state.Genes, loaded once at start).
 * Type-ahead over gene names, several genes allowed; picking moves the shared genome domains to the genes (merged
 * windows) and reports the names so the track highlights them. "Back to event" restores `homeDomains`.
 */
export default function GeneSearchBox({ homeDomains = null, picked, onPicked, width = 240 }) {
  const dispatch = useDispatch();
  const options = useSelector((s) => s.Genes.optionsList);
  const starts = useSelector((s) => s.Genes.genesStartPoint);
  const ends = useSelector((s) => s.Genes.genesEndPoint);
  const loading = useSelector((s) => s.Genes.loadingGenesData);
  const genomeLength = useSelector((s) => s.Settings.genomeLength);
  const domains = useSelector((s) => s.Settings.domains);
  const [values, setValues] = useState([]);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const hits = searchGeneOptions(options, query, 30);
    const have = new Set(hits.map((o) => o.value));
    return [...(options || []).filter((o) => values.includes(o.value) && !have.has(o.value)), ...hits];
  }, [options, query, values]);
  const ready = Array.isArray(options) && options.length > 0;

  const apply = (next) => {
    setValues(next);
    const spans = pickedSpans(next, options, starts, ends);
    onPicked(spans.map((s) => s.name));
    const target = domainsForSpans(spans, genomeLength);
    if (target) dispatch(settingsActions.updateDomains(target));
  };
  const back = () => {
    setValues([]);
    onPicked([]);
    if (homeDomains) dispatch(settingsActions.updateDomains(homeDomains));
  };
  const away = homeDomains && !sameDomains(domains, homeDomains);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <Select
        size="small" showSearch mode="multiple" allowClear maxTagCount="responsive" style={{ width }}
        loading={loading && !ready} disabled={!ready}
        placeholder={ready ? "Search genes" : loading ? "Loading genes" : "Gene search not available (gene index not loaded)"}
        filterOption={false} onSearch={setQuery} onBlur={() => setQuery("")} onChange={apply}
        value={values} options={shown} notFoundContent={query ? "No gene matches" : "Type a gene name"}
        data-testid="gene-search"
      />
      {homeDomains && (picked?.length > 0 || away) && <Button size="small" onClick={back}>Back to event</Button>}
    </span>
  );
}
