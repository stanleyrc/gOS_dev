import React from "react";
import { Alert } from "antd";

/**
 * Keeps a failing card from taking the whole page down: renders the error
 * message in place (with the component stack in the console) so the rest
 * of the view stays usable and the failure is reportable.
 */
export default class ScErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("single-cell view failed", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (error) {
      return <Alert type="error" showIcon message={this.props.title || "This view failed to render"} description={`${error?.message || error}`} style={{ margin: 8 }} />;
    }
    return this.props.children;
  }
}
