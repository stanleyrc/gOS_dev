import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select, Space, Spin, Typography } from "antd";
import HintLine from "../hintLine";
import SpliceReadsPanel from "../rna/spliceReadsPanel";
import { loadPatientSplicing } from "./cohortSpliceEvent";
import { normalizeSplicing } from "../../../helpers/singleCell/splicing";
import { spliceReadsView } from "../../../helpers/singleCell/spliceEventTable";

const { Text } = Typography;
const k = "components.single-cell.splicing";
const normCache = new Map();

/** A patient's normalised splicing.json (cached), or null. */
function loadNormalized(dataset, patient) {
  const key = `${dataset.dataPath}${patient}`;
  if (!normCache.has(key)) {
    normCache.set(
      key,
      loadPatientSplicing(dataset, patient)
        .then((r) => {
          try {
            return r?.status === "ok" ? normalizeSplicing(r.data) : null;
          } catch (e) {
            return null;
          }
        })
        .catch(() => null)
    );
  }
  return normCache.get(key);
}

/**
 * Raw reads for the junction events of one cohort cluster: pick a patient's event (patients with an exported event
 * of the cluster, events with reads first) and open it in IGV (cells using the junction + a control).
 */
export default function CohortSpliceReads({ dataset, patients = [], cluster }) {
  const { t } = useTranslation("common");
  const [files, setFiles] = useState(null);
  const [pick, setPick] = useState(null);
  const clusterId = cluster?.id;
  useEffect(() => {
    let active = true;
    setFiles(null);
    setPick(null);
    if (!dataset || !clusterId) return undefined;
    Promise.all(patients.map((p) => loadNormalized(dataset, p).then((d) => [p, d]))).then((rows) => active && setFiles(Object.fromEntries(rows)));
    return () => {
      active = false;
    };
  }, [dataset, clusterId, patients]);
  const options = useMemo(() => {
    if (!files) return [];
    return patients
      .flatMap((p) =>
        (files[p]?.events || [])
          .filter((e) => e.clusterId === clusterId)
          .map((e) => ({ p, e, ok: spliceReadsView(e, { spliceReads: files[p].spliceReads }).available }))
      )
      .sort((a, b) => Number(b.ok) - Number(a.ok) || b.e.reads - a.e.reads)
      .map((o) => ({ value: `${o.p}|${o.e.id}`, label: `${o.p} · ${o.e.summary}${o.ok ? "" : ` [${t(`${k}.ev-reads-none`)}]`}`, ...o }));
  }, [files, patients, clusterId, t]);
  useEffect(() => {
    if (options.length && !options.some((o) => o.value === pick)) setPick(options[0].value);
  }, [options, pick]);
  const sel = options.find((o) => o.value === pick);
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }} data-testid="cohort-splice-reads">
      <Space wrap>
        <Text strong>{t(`${k}.cohort-reads`)}</Text>
        <HintLine inline text={t(`${k}.cohort-reads-help`)} />
        {options.length > 0 && <Select size="small" style={{ minWidth: 420, maxWidth: 760 }} value={pick} onChange={setPick} options={options.map(({ value, label }) => ({ value, label }))} showSearch optionFilterProp="label" />}
      </Space>
      {!files ? <Spin size="small" /> : !options.length ? <Text type="secondary">{t(`${k}.cohort-reads-none`)}</Text> : sel && <SpliceReadsPanel event={sel.e} spliceReads={files[sel.p].spliceReads} patientId={sel.p} />}
    </Space>
  );
}
