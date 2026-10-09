import React, { useEffect, useState } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { Layout, ConfigProvider, theme as antdTheme } from "antd";
import { applyAppTheme, getAppTheme, onAppThemeChange } from "./helpers/appTheme";
import UpdateNotice from "./components/updateNotice";
import singleCellActions from "./redux/singleCell/actions";
import { CN_PALETTE_PRESETS } from "./helpers/singleCell/matrix";
import { store, history } from "./redux/store";
import { I18nextProvider } from "react-i18next";
import { Provider } from "react-redux";
import PublicRoutes from "./router";
import Boot from "./redux/boot";
import i18n from "./i18n";
import en_US from "antd/lib/locale/en_US";
import AppHolder from "./commonStyle";
import { siteConfig } from "./settings";
import Topbar from "./containers/topbar/topbar";
import UserSignInModal from "./components/userSignInModal";
import "./global.css";

const { Content, Footer } = Layout;

// antd's default stack minus its trailing emoji fonts: with 'Noto Color Emoji'
// listed, Chromium on Linux (no Roboto / Helvetica / Arial installed) takes
// digits and spaces from the emoji font ("SBS 4 0 c"). Emoji still render
// through the system fallback; Mac / Windows resolve the first families as before.
const APP_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', 'DejaVu Sans', sans-serif";

// apply the stored theme before the first render, so plots drawn in their
// mount effects (which run before App's) already see the right colours
if (typeof document !== "undefined") applyAppTheme(getAppTheme());

function App() {
  // light / dark: stored in the browser, applied to antd and to <html data-theme>
  const [mode, setMode] = useState(getAppTheme());
  useEffect(() => {
    applyAppTheme(mode);
    // the CN heatmap palette follows the theme between its light / dark pgv variants
    const preset = store.getState().SingleCell?.palette?.preset;
    const want = mode === "dark" ? "pgvDark" : "pgv";
    if ((preset === "pgv" || preset === "pgvDark") && preset !== want) {
      store.dispatch(singleCellActions.updatePalette({ preset: want, ...CN_PALETTE_PRESETS[want] }));
    } else if (preset === want) {
      // force heatmaps to redraw with the theme-aware neutral colours
      store.dispatch(singleCellActions.updatePalette({ ...store.getState().SingleCell.palette }));
    }
    return onAppThemeChange(setMode);
  }, [mode]);
  return (
    <ConfigProvider locale={en_US} theme={{ algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm, token: { fontFamily: APP_FONT_FAMILY } }}>
      <Provider store={store}>
        <I18nextProvider i18n={i18n}>
          <Router history={history}>
            <AppHolder>
              <Layout className="ant-full-layout">
                <Topbar />
                <Content className="ant-full-content">
                  <PublicRoutes />
                </Content>
                <Footer className="ant-full-footer">
                  {siteConfig.footerText}
                </Footer>
              </Layout>
              <UserSignInModal />
              <UpdateNotice />
            </AppHolder>
          </Router>
        </I18nextProvider>
      </Provider>
    </ConfigProvider>
  );
}
Boot()
  .then(() => App())
  .catch((error) => console.error(error));
export default App;
