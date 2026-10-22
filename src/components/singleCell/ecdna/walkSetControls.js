import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Segmented, Space, Tag, Tooltip } from "antd";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { fitText, recoveryBadge, recoverySummary, walkChips } from "../../../helpers/singleCell/walkSetCompare";

/** walks_peel_v4.json of the open patient, fetched on first use: { status: idle | loading | ok | missing | error, data }. */
export function usePeelSource(active, patient) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const [state, setState] = useState({ patient: null, source: { status: "idle" } });
  useEffect(() => {
    if (!active || !dataset || !patient) return undefined;
    if (state.patient === patient && state.source.status !== "idle") return undefined;
    let cancelled = false;
    setState({ patient, source: { status: "loading" } });
    tryGet(casePath(dataset, patient, "walks_peel_v4.json")).then((res) => {
      if (!cancelled) setState({ patient, source: res });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, dataset, patient]);
  return state.patient === patient ? state.source : { status: active ? "loading" : "idle" };
}

/** Curated / Peel v4 / Compare selector; Peel v4 is disabled with a reason when the patient has no such file. */
export function WalkSetSelector({ value, onChange, peelStatus }) {
  const missing = peelStatus === "missing" || peelStatus === "error";
  const peelLabel = missing ? (
    <Tooltip title="not available (no peel v4 walks for this patient)"><span>Peel v4 (proposed)</span></Tooltip>
  ) : (
    "Peel v4 (proposed)"
  );
  return (
    <Segmented
      size="small"
      value={value}
      onChange={onChange}
      options={[
        { value: "curated", label: "Curated (yours)" },
        { value: "peel_v4", label: peelLabel, disabled: missing && value !== "peel_v4" },
        { value: "compare", label: missing ? <Tooltip title="not available (no peel v4 walks for this patient)"><span>Compare</span></Tooltip> : "Compare", disabled: missing && value !== "compare" },
      ]}
    />
  );
}

/** Banner on the peel set: what it is (not curated), the fit, and the copies toggle. */
export function PeelBanner({ data, copies, onCopies, hasCplex }) {
  const fit = fitText(data?.fit);
  return (
    <Alert
      type="info"
      showIcon
      style={{ marginTop: 8 }}
      message={
        <Space wrap size={12}>
          <span>Proposed walks: species-guided balance + peel on v4 graphs (orientation-preserving junction de-duplication); not curated</span>
          {fit && <b>{fit}</b>}
          <Segmented
            size="small"
            value={copies}
            onChange={onCopies}
            options={[{ value: "free", label: "free (NNLS)" }, { value: "cplex", label: "junction CPLEX", disabled: !hasCplex }]}
          />
        </Space>
      }
      description={data?.notes ? `${data.notes}` : undefined}
    />
  );
}

/** Red "not recovered" / orange "partial" badge (reason on hover) for a curated walk, proposal / open chips for a peel walk. */
export function WalkBadges({ walk, recovery }) {
  if (!walk) return null;
  const badge = walk.curated && recovery ? recoveryBadge(recovery.get(`${walk.id}`)) : null;
  const chips = walk.curated ? [] : walkChips(walk);
  if (!badge && !chips.length) return null;
  return (
    <>
      {badge && <Tooltip title={badge.reason}><Tag color={badge.color} style={{ margin: 0, marginLeft: 3 }}>{badge.text}</Tag></Tooltip>}
      {chips.map((c) => <Tooltip key={c.key} title={c.title}><Tag color={c.color} style={{ margin: 0, marginLeft: 3 }}>{c.text}</Tag></Tooltip>)}
    </>
  );
}

/** One-line recovery summary of the patient's curated walks ("k of n curated walks recovered"). */
export function RecoverySummary({ data }) {
  const text = recoverySummary(data);
  return text ? <Tag color="blue" style={{ margin: 0 }}>{text}</Tag> : null;
}
