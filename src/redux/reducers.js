import App from "./app/reducer";
import CaseReports from "./caseReports/reducer";
import CaseReport from "./caseReport/reducer";
import PopulationStatistics from "./populationStatistics/reducer";
import FilteredEvents from "./filteredEvents/reducer";
import SageQc from "./sageQc/reducer";
import Ppfit from "./ppfit/reducer";
import Settings from "./settings/reducer";
import Genes from "./genes/reducer";
import Genome from "./genome/reducer";
import GenomeCoverage from "./genomeCoverage/reducer";
import Hetsnps from "./hetsnps/reducer";
import Mutations from "./mutations/reducer";
import Allelic from "./allelic/reducer";
import SignatureStatistics from "./signatureStatistics/reducer";

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  App,
  CaseReports,
  CaseReport,
  PopulationStatistics,
  FilteredEvents,
  SageQc,
  Ppfit,
  Settings,
  Genes,
  Genome,
  GenomeCoverage,
  Hetsnps,
  Mutations,
  Allelic,
  SignatureStatistics
};
