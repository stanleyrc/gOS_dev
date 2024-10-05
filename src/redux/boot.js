import { store } from "./store";
import appActions from "./app/actions";
import settingsActions from "./settings/actions";
import genesActions from "./genes/actions";
import biomarkersActions from "./biomarkers/actions";
import curatedGenesActions from "./curatedGenes/actions";

// eslint-disable-next-line import/no-anonymous-default-export
export default () =>
  new Promise(() => {
    // store.dispatch(appActions.bootApp());
    store.dispatch(settingsActions.fetchSettingsData());
    store.dispatch(genesActions.fetchGenesData("hg19"));
    store.dispatch(biomarkersActions.fetchBiomarkers());
    store.dispatch(curatedGenesActions.fetchCuratedGenes());
    // store.dispatch(appActions.loadCommons());
  });
