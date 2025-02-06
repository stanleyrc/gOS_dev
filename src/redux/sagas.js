import { all } from "redux-saga/effects";
import appSagas from "./app/saga";
import datasetsSagas from "./datasets/saga";
import caseReportsSagas from "./caseReports/saga";
import caseReportSagas from "./caseReport/saga";
import populationStatisticsSagas from "./populationStatistics/saga";
import filteredEventsSagas from "./filteredEvents/saga";
import SageQcSagas from "./sageQc/saga";
import PpfitSagas from "./ppfit/saga";
import SettingsSagas from "./settings/saga";
import GenesSagas from "./genes/saga";
import GenomeSagas from "./genome/saga";
import GenomeCoverageSagas from "./genomeCoverage/saga";
import HetsnpsSagas from "./hetsnps/saga";
import MutationsSagas from "./mutations/saga";
import AllelicSagas from "./allelic/saga";
import signatureStatisticsSagas from "./signatureStatistics/saga";
import signatureProfilesSagas from "./signatureProfiles/saga";
import biomarkersSagas from "./biomarkers/saga";
import curatedGenesSagas from "./curatedGenes/saga";
import igvSagas from "./igv/saga";
import highlightsSagas from "./highlights/saga";

export default function* rootSaga(getState) {
  yield all([
    appSagas(),
    datasetsSagas(),
    caseReportsSagas(),
    caseReportSagas(),
    populationStatisticsSagas(),
    filteredEventsSagas(),
    SageQcSagas(),
    PpfitSagas(),
    SettingsSagas(),
    GenesSagas(),
    GenomeSagas(),
    GenomeCoverageSagas(),
    HetsnpsSagas(),
    MutationsSagas(),
    AllelicSagas(),
    signatureStatisticsSagas(),
    signatureProfilesSagas(),
    biomarkersSagas(),
    curatedGenesSagas(),
    igvSagas(),
    highlightsSagas(),
  ]);
}
