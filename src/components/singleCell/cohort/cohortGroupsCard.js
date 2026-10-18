import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Col, Input, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography, message } from "antd";
import { DeleteOutlined, EditOutlined, LinkOutlined, SaveOutlined, TeamOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import scaActions from "../../../redux/scAnalysis/actions";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { mergeRnaMatrices } from "../../../helpers/singleCell/rnaMerge";
import {
  REST, cellKey, compareFromSearch, compareLink, composition, contrastWarnings, deleteGroup, dominance, groupsOf, isEmptyDef,
  makeDef, mergeIncoming, nextName, renameGroup, resolveKeys, upsertGroup, withGroups,
} from "../../../helpers/singleCell/cohortGroups";
import { fieldLabel } from "../../../helpers/singleCell/fieldLabels";
import ScErrorBoundary from "../errorBoundary";
import DePanel from "../rna/dePanel";
import ViolinPanel from "../rna/violinPanel";
import HintLine from "../hintLine";
import { patientColor } from "./charts";

const { Text } = Typography;
const PREFERRED = ["Cell_Type", "state", "seurat_clusters", "Region", "Region_Annotation", "Phase", "Clone_Annotation"];
const pct = (f) => `${Math.round(100 * f)}%`;

/** Cells per patient of one group, as small tags. */
function CompositionTags({ keys, order }) {
  const comp = composition(keys);
  return (
    <Space size={[2, 2]} wrap>
      {comp.map((c) => (
        <Tag key={c.patient} style={{ margin: 0, borderColor: patientColor(order.indexOf(c.patient)) }}>{`${c.patient} ${c.n}`}</Tag>
      ))}
    </Space>
  );
}

/** One warning line per confounding finding of a contrast (see helpers/cohortGroups.js). */
function ConfoundingAlerts({ result, labelA, labelB, t }) {
  return result.warnings.map((w, i) => {
    const label = w.side === "A" ? labelA : labelB;
    const text =
      w.kind === "disjoint"
        ? t("components.single-cell.cohort.groups-warn-disjoint", { defaultValue: "{{a}} and {{b}} share no patient ({{pa}} vs {{pb}}): any difference between them is also a difference between patients.", a: labelA, b: labelB, pa: w.patientsA.join(", "), pb: w.patientsB.join(", ") })
        : w.single
          ? t("components.single-cell.cohort.groups-warn-single", { defaultValue: "{{g}} comes from one patient only ({{p}}): results are confounded with that patient.", g: label, p: w.patient })
          : t("components.single-cell.cohort.groups-warn-dominated", { defaultValue: "{{g}} is dominated by {{p}} ({{f}} of its cells): results may reflect that patient.", g: label, p: w.patient, f: pct(w.fraction) });
    return <Alert key={i} type="warning" showIcon style={{ marginBottom: 4 }} message={text} />;
  });
}

/**
 * The comparison itself: pools the involved patients' matrices (union of genes,
 * cells in patient order) into one summary + matrix and hands them, with the
 * two groups in the shared A/B state, to the per-patient DE panel and violins.
 */
function GroupComparison({ keysA, keysB, labelA, labelB, loaded, rna, datasetOf }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [pooled, setPooled] = useState(null);
  const [error, setError] = useState(null);
  const [gene, setGene] = useState(null);
  const [violinGenes, setViolinGenes] = useState(["EGFR"]);
  const involved = useMemo(() => {
    const ps = new Set([...keysA, ...keysB].map((k) => k.split("::")[0]));
    return loaded.filter((s) => ps.has(s.caseReportId));
  }, [keysA, keysB, loaded]);
  const involvedKey = involved.map((s) => s.caseReportId).join("|");

  useEffect(() => {
    let active = true;
    setPooled(null);
    setError(null);
    (async () => {
      try {
        const entries = [];
        for (const s of involved) {
          const summary = rna[s.caseReportId].summary;
          // eslint-disable-next-line no-await-in-loop
          const matrix = await loadRnaMatrix(datasetOf(s), s.caseReportId);
          entries.push({ matrix, genes: summary.genes, nCells: summary.cells.length, summary, patient: s.caseReportId });
        }
        const merged = mergeRnaMatrices(entries);
        const cells = entries.flatMap((e) => e.summary.cells.map((c) => ({ ...c, patient: e.patient, displayId: cellKey(e.patient, c.rna_id) })));
        const fieldMap = new Map([["patient", { name: "patient", numeric: false }]]);
        entries.forEach((e) => e.summary.fields.forEach((f) => !fieldMap.has(f.name) && fieldMap.set(f.name, f)));
        const rowOf = new Map(cells.map((c, k) => [c.displayId, k]));
        if (active) setPooled({ summary: { genes: merged.genes, geneIndex: merged.geneIndex, cells, fields: [...fieldMap.values()], nCells: merged.nCells }, matrix: merged.matrix, rowOf });
      } catch (e) {
        if (active) setError(`${e?.message || e}`);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [involvedKey, rna]);

  // the A/B state the DE and violin panels read
  useEffect(() => {
    dispatch(scaActions.setGroup("A", keysA.length ? [{ patient: "cohort", cells: keysA }] : [], labelA));
    dispatch(scaActions.setGroup("B", keysB.length ? [{ patient: "cohort", cells: keysB }] : [], labelB));
  }, [dispatch, keysA, keysB, labelA, labelB]);
  useEffect(() => () => dispatch(scaActions.clearGroups()), [dispatch]);

  const rowOf = pooled?.rowOf;
  const rowsFor = useCallback((ids) => [...new Set((ids || []).map((id) => rowOf?.get(id)).filter((k) => k != null))], [rowOf]);
  if (error) return <Alert type="error" showIcon message={error} />;
  if (!pooled) return <Text type="secondary">{t("components.single-cell.loading")}</Text>;
  return (
    <Row gutter={[0, 12]}>
      <Col span={24}>
        <ScErrorBoundary resetKey={involvedKey} title="DE view failed">
          <DePanel summary={pooled.summary} matrix={pooled.matrix} rowsFor={rowsFor} onGene={setGene} selectedGene={gene} onViolins={setViolinGenes} defaultDotGroupBy="groups" />
        </ScErrorBoundary>
      </Col>
      <Col span={24}>
        <ScErrorBoundary resetKey={involvedKey} title="Violin view failed">
          <ViolinPanel summary={pooled.summary} matrix={pooled.matrix} rowsFor={rowsFor} genes={violinGenes} onGenesChange={setViolinGenes} defaultGroupBy="groups" />
        </ScErrorBoundary>
      </Col>
    </Row>
  );
}

/**
 * Cohort RNA: build named cell groups (UMAP box selection and / or filters
 * by patient, cell type, state, cluster, region, phase, clone), save them
 * per dataset, and compare two (or one against the rest) with the same DE,
 * enrichment, dot plot and violins as a single patient.
 */
export default function CohortGroupsCard({ summaries, datasets, rna, loaded, cellsOf, tumorOnly, umapSelection, onSelectUmap, onResolved = null }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout);
  const dataset = datasets.find((d) => summaries.some((s) => `${s.record.datasetId}` === `${d.id}`)) || datasets[0];
  const datasetId = dataset?.id;
  const datasetOf = (s) => datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
  const saved = useMemo(() => groupsOf(layout.cohortGroups, datasetId), [layout.cohortGroups, datasetId]);
  const setSaved = useCallback((next) => dispatch(singleCellActions.updateLayout({ cohortGroups: withGroups(layout.cohortGroups, datasetId, next) })), [dispatch, layout.cohortGroups, datasetId]);

  const patients = loaded.map((s) => s.caseReportId);
  const cellsByPatient = useMemo(
    () => Object.fromEntries(loaded.map((s) => [s.caseReportId, cellsOf(s)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, rna, tumorOnly]
  );
  const categorical = useMemo(() => {
    const names = new Set();
    loaded.forEach((s) => rna[s.caseReportId].summary.fields.filter((f) => !f.numeric).forEach((f) => names.add(f.name)));
    const all = [...names].filter((n) => n !== "saved_group");
    return [...PREFERRED.filter((n) => all.includes(n)), ...all.filter((n) => !PREFERRED.includes(n))];
  }, [loaded, rna]);
  const levelsOf = (field) => {
    const counts = new Map();
    Object.values(cellsByPatient).forEach((cells) => cells.forEach((c) => c[field] != null && c[field] !== "" && counts.set(`${c[field]}`, (counts.get(`${c[field]}`) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => `${a[0]}`.localeCompare(`${b[0]}`, undefined, { numeric: true })).map(([v, n]) => ({ value: v, label: `${v} (${n})` }));
  };

  // ---- builder ----
  const [name, setName] = useState("");
  const [pats, setPats] = useState([]);
  const [fields, setFields] = useState([]);
  const [filters, setFilters] = useState({});
  const [useUmap, setUseUmap] = useState(false);
  const draft = useMemo(() => makeDef({ name, patients: pats, filters: Object.fromEntries(fields.map((f) => [f, filters[f] || []])), keys: useUmap ? [...umapSelection] : [] }), [name, pats, fields, filters, useUmap, umapSelection]);
  const draftKeys = useMemo(() => resolveKeys(draft, cellsByPatient), [draft, cellsByPatient]);
  const draftDom = dominance(draftKeys);
  const save = () => {
    if (isEmptyDef(draft) || !draftKeys.length) return;
    const label = draft.name || nextName(saved);
    setSaved(upsertGroup(saved, { ...draft, name: label }));
    setName("");
  };
  const edit = (g) => {
    setName(g.name);
    setPats(g.patients);
    setFields(Object.keys(g.filters));
    setFilters(g.filters);
    setUseUmap(g.keys.length > 0);
    if (g.keys.length) onSelectUmap(g.keys, false);
  };

  // ---- saved groups ----
  const savedKeys = useMemo(() => Object.fromEntries(saved.map((g) => [g.name, resolveKeys(g, cellsByPatient)])), [saved, cellsByPatient]);
  const [renaming, setRenaming] = useState(null);
  useEffect(() => {
    if (onResolved) onResolved(saved.map((g) => ({ name: g.name, keys: savedKeys[g.name] || [] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, savedKeys]);

  // ---- comparison ----
  const [a, setA] = useState(null);
  const [b, setB] = useState(REST);
  const [active, setActive] = useState(null); // { a, b } being compared
  const keysFor = (nm) => {
    if (nm === REST) return null;
    return savedKeys[nm] || [];
  };
  const keysA = a ? keysFor(a) || [] : [];
  const setA_ = new Set(keysA);
  const restKeys = useMemo(() => Object.entries(cellsByPatient).flatMap(([p, cells]) => cells.map((c) => cellKey(p, c.rna_id))).filter((k) => !setA_.has(k)), [cellsByPatient, a, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const keysB = b === REST ? restKeys : keysFor(b) || [];
  const overlap = keysB.filter((k) => setA_.has(k)).length;
  const contrast = useMemo(() => contrastWarnings(keysA, keysB), [keysA.length, keysB.length, a, b, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = a && b && keysA.length >= 3 && keysB.length >= 3 && !overlap && a !== b;
  const labelOf = (nm) => (nm === REST ? t("components.single-cell.rna.all-other") : nm);

  // a linked comparison: groups from the URL join the stored ones, then the pair opens once the RNA is loaded
  const linked = useRef(compareFromSearch(window.location.search));
  const applied = useRef(false);
  useEffect(() => {
    const link = linked.current;
    if (!link || applied.current || !datasetId) return;
    applied.current = true;
    if (link.groups.length) setSaved(mergeIncoming(saved, link.groups));
    if (link.a) setA(link.a);
    if (link.b) setB(link.b);
    if (link.a && link.b) setActive({ a: link.a, b: link.b });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const copyLink = async () => {
    const url = compareLink(window.location.href, saved, a, b);
    try {
      await navigator.clipboard.writeText(url);
      message.success(t("components.single-cell.saved-groups.copied"));
    } catch (error) {
      window.prompt(t("components.single-cell.saved-groups.copy-prompt"), url);
    }
  };

  const columns = [
    {
      title: t("components.single-cell.cohort.groups-name", { defaultValue: "Group" }),
      dataIndex: "name",
      render: (nm) =>
        renaming?.from === nm ? (
          <Input
            size="small"
            autoFocus
            style={{ width: 180 }}
            value={renaming.to}
            onChange={(e) => setRenaming({ from: nm, to: e.target.value })}
            onBlur={() => setRenaming(null)}
            onPressEnter={() => {
              setSaved(renameGroup(saved, nm, renaming.to));
              if (a === nm) setA(renaming.to.trim());
              if (b === nm) setB(renaming.to.trim());
              setRenaming(null);
            }}
          />
        ) : (
          <Text strong>{nm}</Text>
        ),
    },
    { title: t("components.single-cell.cohort.groups-cells", { defaultValue: "Cells" }), width: 70, render: (_, g) => (savedKeys[g.name] || []).length },
    { title: t("components.single-cell.cohort.patient"), render: (_, g) => <CompositionTags keys={savedKeys[g.name] || []} order={patients} /> },
    {
      title: t("components.single-cell.cohort.groups-definition", { defaultValue: "Definition" }),
      render: (_, g) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {[g.patients.length ? g.patients.join("+") : null, ...Object.entries(g.filters).map(([f, l]) => `${fieldLabel(f)}: ${l.join("/")}`), g.keys.length ? `${g.keys.length} boxed` : null].filter(Boolean).join(" · ")}
        </Text>
      ),
    },
    {
      title: "",
      width: 190,
      render: (_, g) => (
        <Space size={2}>
          <Button size="small" type="text" onClick={() => onSelectUmap(savedKeys[g.name] || [], false)}>{t("components.single-cell.cohort.groups-show", { defaultValue: "Show on UMAP" })}</Button>
          <Tooltip title={t("components.single-cell.cohort.groups-edit", { defaultValue: "Load into the builder" })}><Button size="small" type="text" icon={<EditOutlined />} onClick={() => edit(g)} /></Tooltip>
          <Tooltip title={t("components.single-cell.cohort.groups-rename", { defaultValue: "Rename" })}><Button size="small" type="text" onClick={() => setRenaming({ from: g.name, to: g.name })}>Aa</Button></Tooltip>
          <Tooltip title={t("components.single-cell.cohort.groups-delete", { defaultValue: "Delete" })}>
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setSaved(deleteGroup(saved, g.name));
                if (a === g.name) setA(null);
                if (b === g.name) setB(REST);
                if (active && (active.a === g.name || active.b === g.name)) setActive(null);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  if (!loaded.length) return null;
  const groupOptions = saved.map((g) => ({ value: g.name, label: `${g.name} (${(savedKeys[g.name] || []).length})` }));
  const fieldOptions = categorical.map((f) => ({ value: f, label: fieldLabel(f) }));
  return (
    <Card size="small" title={<Space><TeamOutlined />{t("components.single-cell.cohort.groups-title", { defaultValue: "Cell groups: build, save and compare" })}</Space>}>
      <Row gutter={[16, 12]}>
        <Col xs={24} xl={12}>
          <Text strong>{t("components.single-cell.cohort.groups-build", { defaultValue: "1. Build a group" })}</Text>
          <Space direction="vertical" size={6} style={{ width: "100%", marginTop: 6 }}>
            <Space wrap size={[8, 6]}>
              <Select size="small" mode="multiple" allowClear style={{ minWidth: 200 }} placeholder={t("components.single-cell.cohort.de-all-patients")} value={pats} onChange={setPats} options={patients.map((p) => ({ value: p, label: p }))} maxTagCount="responsive" />
              <Select size="small" mode="multiple" allowClear showSearch optionFilterProp="label" style={{ minWidth: 220 }} placeholder={t("components.single-cell.cohort.groups-filter-by", { defaultValue: "Filter by (state, phase, region, clone...)" })} value={fields} onChange={setFields} options={fieldOptions} maxTagCount="responsive" />
            </Space>
            {fields.map((f) => (
              <Space key={f} size={6} wrap>
                <Text type="secondary" style={{ minWidth: 110, display: "inline-block" }}>{fieldLabel(f)}</Text>
                <Select size="small" mode="multiple" allowClear style={{ minWidth: 260 }} placeholder={t("components.single-cell.cohort.de-all-levels")} value={filters[f] || []} onChange={(v) => setFilters({ ...filters, [f]: v })} options={levelsOf(f)} maxTagCount="responsive" />
              </Space>
            ))}
            <Space size={6} wrap>
              <Switch size="small" checked={useUmap} onChange={setUseUmap} disabled={!umapSelection.size} />
              <Text>{t("components.single-cell.cohort.groups-use-umap", { defaultValue: "Only cells boxed on the UMAP ({{count}})", count: umapSelection.size })}</Text>
              {!umapSelection.size && <Text type="secondary">{t("components.single-cell.cohort.umap-drag")}</Text>}
            </Space>
            <Space.Compact size="small">
              <Input style={{ width: 200 }} placeholder={nextName(saved)} value={name} onChange={(e) => setName(e.target.value)} onPressEnter={save} />
              <Button icon={<SaveOutlined />} type="primary" disabled={isEmptyDef(draft) || !draftKeys.length} onClick={save}>
                {t("components.single-cell.cohort.groups-save", { defaultValue: "Save group ({{count}} cells)", count: draftKeys.length })}
              </Button>
            </Space.Compact>
            {!isEmptyDef(draft) && (
              <Space wrap size={[6, 2]}>
                <CompositionTags keys={draftKeys} order={patients} />
                {draftDom.warn && draftDom.total > 0 && <Text type="warning">{t("components.single-cell.cohort.groups-warn-dominated-short", { defaultValue: "{{p}} holds {{f}} of these cells", p: draftDom.dominant, f: pct(draftDom.fraction) })}</Text>}
              </Space>
            )}
          </Space>
        </Col>
        <Col xs={24} xl={12}>
          <Text strong>{t("components.single-cell.cohort.groups-compare", { defaultValue: "2. Compare" })}</Text>
          <Space direction="vertical" size={6} style={{ width: "100%", marginTop: 6 }}>
            <Space wrap size={[8, 6]}>
              <Tag color="#d4380d" style={{ fontWeight: 600 }}>A</Tag>
              <Select size="small" style={{ minWidth: 200 }} value={a} onChange={setA} options={groupOptions} placeholder={t("components.single-cell.cohort.groups-pick", { defaultValue: "Pick a saved group" })} />
              <Text type="secondary">vs</Text>
              <Tag color="#1d39c4" style={{ fontWeight: 600 }}>B</Tag>
              <Select size="small" style={{ minWidth: 200 }} value={b} onChange={setB} options={[{ value: REST, label: t("components.single-cell.rna.all-other") }, ...groupOptions.filter((o) => o.value !== a)]} />
              <Button size="small" type="primary" disabled={!ready} onClick={() => setActive({ a, b })}>{t("components.single-cell.cohort.groups-run", { defaultValue: "Compare" })}</Button>
              <Tooltip title={t("components.single-cell.cohort.groups-link-help", { defaultValue: "Copy a link that reopens this comparison with its groups" })}>
                <Button size="small" type="text" icon={<LinkOutlined />} disabled={!a || !b} onClick={copyLink}>{t("components.single-cell.saved-groups.link")}</Button>
              </Tooltip>
            </Space>
            {a && (
              <Space direction="vertical" size={2}>
                <Space wrap size={4}><Text type="secondary">A</Text><CompositionTags keys={keysA} order={patients} /></Space>
                <Space wrap size={4}><Text type="secondary">B</Text>{b === REST ? <Text type="secondary">{`${keysB.length} cells, ${composition(keysB).length} patients`}</Text> : <CompositionTags keys={keysB} order={patients} />}</Space>
              </Space>
            )}
            {a && b && <ConfoundingAlerts result={contrast} labelA={labelOf(a)} labelB={labelOf(b)} t={t} />}
            {a && b && overlap > 0 && <Alert type="error" showIcon message={t("components.single-cell.cohort.groups-overlap", { defaultValue: "A and B share {{count}} cells; differential expression needs disjoint groups.", count: overlap })} />}
            {a && b && !overlap && (keysA.length < 3 || keysB.length < 3) && <Alert type="info" showIcon message={t("components.single-cell.cohort.groups-small", { defaultValue: "Each group needs at least 3 cells." })} />}
          </Space>
        </Col>
        <Col span={24}>
          <Text strong>{t("components.single-cell.cohort.groups-saved", { defaultValue: "Saved groups" })}</Text>
          <Table size="small" style={{ marginTop: 6 }} rowKey="name" columns={columns} dataSource={saved} pagination={saved.length > 8 ? { pageSize: 8, size: "small" } : false} locale={{ emptyText: t("components.single-cell.cohort.groups-empty", { defaultValue: "No saved groups yet. Build one above, or box cells on the UMAP." }) }} />
          <HintLine text={t("components.single-cell.cohort.groups-help", { defaultValue: "Groups are stored in this browser for this dataset and can span patients. Compare runs the single-patient DE, dot plot and violins on the patients' pooled expression; use the per-patient mode of the cohort DE panel below to control for patient." })} />
        </Col>
        {active && ready && active.a === a && active.b === b && (
          <Col span={24}>
            <GroupComparison key={`${a}|${b}`} keysA={keysA} keysB={keysB} labelA={labelOf(a)} labelB={labelOf(b)} loaded={loaded} rna={rna} datasetOf={datasetOf} />
          </Col>
        )}
      </Row>
    </Card>
  );
}
