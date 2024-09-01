import React from "react";
import { Switch, Route } from "react-router-dom";
import { connect } from "react-redux";
import Home from "./containers/home/home";
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
        {/* <Route exact path="/" component={Home} /> */}
        <Route path="/" component={HomePage} />
        <Route component={Error} />
      </Switch>
    </Route>
  );
};

export default connect((state) => ({
  criticalError: state.Settings.error || state.CaseReports.error,
}))(PublicRoutes);
