import { store } from "./store";
import settingsActions from "./settings/actions";

// eslint-disable-next-line import/no-anonymous-default-export
export default () =>
  new Promise(() => {
    store.dispatch(settingsActions.launchApplication());
  });
