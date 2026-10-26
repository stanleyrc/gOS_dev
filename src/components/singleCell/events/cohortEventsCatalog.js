import React, { useMemo, useState } from "react";
import EventsCatalogTable from "./eventsCatalogTable";
import useCatalogExtras from "./useCatalogExtras";
import { isReportVersion } from "../../../helpers/singleCell/eventsCatalog";

/** Cohort events catalog: the cohort files plus the arm / junction exports; report versions (_T2, _v5) hidden unless asked. */
export default function CohortEventsCatalog({ summaries, datasets, cohortFiles, datasetKey }) {
  const [showVersions, setShowVersions] = useState(false);
  const extras = useCatalogExtras(summaries, datasets);
  const ids = useMemo(() => summaries.map((s) => s.caseReportId).filter((id) => showVersions || !isReportVersion(id)), [summaries, showVersions]);
  const nExtras = Object.keys(extras).length;
  const filesByPatient = useMemo(() => {
    const out = {};
    ids.forEach((id) => {
      const f = cohortFiles.files[id];
      // a patient is shown once its arm / junction files have been looked for too, so "not exported" is never a loading artefact
      if (f && extras[id]) out[id] = { ...f, armEvents: extras[id].armEvents, junctions: extras[id].junctions };
    });
    return out;
  }, [ids, cohortFiles.files, extras]);
  return (
    <EventsCatalogTable
      filesByPatient={filesByPatient}
      patients={ids}
      datasetKey={datasetKey}
      loading={cohortFiles.progress < 100 || nExtras < summaries.length}
      versionToggle={{ checked: showVersions, onChange: setShowVersions }}
    />
  );
}
