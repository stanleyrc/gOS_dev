import React, { useEffect, useState } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { Layout, ConfigProvider, theme as antdTheme } from "antd";
import { applyAppTheme, getAppTheme, onAppThemeChange } from "./helpers/appTheme";
import UpdateNotice from "./components/updateNotice";
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

function App() {
  // light / dark: stored in the browser, applied to antd and to <html data-theme>
  const [mode, setMode] = useState(getAppTheme());
  useEffect(() => {
    applyAppTheme(mode);
    return onAppThemeChange(setMode);
  }, [mode]);
  return (
    <ConfigProvider locale={en_US} theme={{ algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}>
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
