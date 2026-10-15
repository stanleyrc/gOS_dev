import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, Select, Space, Switch, Typography } from "antd";
import { DEFAULT_GENE_FILTER, geneFilterFromSearch, parseGeneList, withGeneFilter } from "../../../helpers/singleCell/spliceGeneFilter";

const { Text } = Typography;
const k = "components.single-cell.splicing";

/** [filter, setFilter]: the splicing gene filter, kept in the URL (spx, spg). */
export function useSpliceGeneFilter() {
  const [filter, setState] = useState(() => {
    try {
      return geneFilterFromSearch(window.location.search);
    } catch (e) {
      return { ...DEFAULT_GENE_FILTER };
    }
  });
  const [text, setText] = useState(() => filter.custom.join(" "));
  const set = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${withGeneFilter(window.location.search, next)}${window.location.hash}`);
      } catch (e) {
        // URL not writable: the filter still applies
      }
      return next;
    });
  }, []);
  return [filter, set, text, setText];
}

/**
 * Gene filter bar: multi-exon switch (on by default: hides single-exon genes and junctions outside the annotated
 * introns), gene list (all / GBM / cancer genes / pasted) and `shown` / `total` counts.
 */
export default function SpliceGeneFilter({ filter, onChange, text, onText, lists = ["all", "gbm", "cancer", "custom"] }) {
  const { t } = useTranslation("common");
  const opts = lists.map((v) => ({ value: v, label: t(`${k}.gf-list-${v}`) }));
  return (
    <Space wrap size={6} data-testid="splice-gene-filter">
      <Switch size="small" checked={filter.multiExon} onChange={(v) => onChange({ multiExon: v })} />
      <Text title={t(`${k}.gf-multi-help`)}>{t(`${k}.gf-multi`)}</Text>
      <Select size="small" style={{ width: 190 }} value={filter.list} options={opts} onChange={(v) => onChange({ list: v })} />
      {filter.list === "custom" && (
        <Input
          size="small"
          allowClear
          style={{ width: 260 }}
          placeholder={t(`${k}.gf-custom-ph`)}
          value={text}
          onChange={(e) => {
            onText(e.target.value);
            onChange({ custom: parseGeneList(e.target.value) });
          }}
        />
      )}
    </Space>
  );
}
