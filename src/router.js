import React from "react";
import { Switch, Route } from "react-router-dom";
import { connect } from "react-redux";
import CriticalError from "./pages/errorPage/CriticalError";
import Error from "./pages/errorPage/Error";
import HomePage from "./pages/homePage";

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
        <Route path="/" component={HomePage} />
        <Route component={Error} />
      </Switch>
    </Route>
  );
};

export default connect((state) => ({
  criticalError:
    state.Datasets.error || state.Settings.error || state.CaseReports.error,
}))(PublicRoutes);
