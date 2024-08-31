import React from "react";
import { Switch, Route } from "react-router-dom";
import { connect } from "react-redux";
import Home from "./containers/home/home";
import CriticalError from "./pages/errorPage/CriticalError";
import Error from "./pages/errorPage/Error";
import LandingPage from "./pages/landingPage";
import DetailPage from "./pages/detailPage";

const PublicRoutes = ({ criticalError }) => {
  return criticalError ? (
    <Route>
      <Switch>
        <Route component={CriticalError} />
      </Switch>
    </Route>
  ) : (
    <Route>
      <Switch>
        {/* <Route exact path="/" component={Home} /> */}
        <Route exact path="/" component={LandingPage} />
        <Route exact path="/:id" component={DetailPage} />
        <Route component={Error} />
      </Switch>
    </Route>
  );
};

export default connect((state) => ({
  criticalError: state.Settings.error || state.CaseReports.error,
}))(PublicRoutes);
