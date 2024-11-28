import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import igv from "../../../node_modules/igv/dist/igv.esm.min.js";
import { withTranslation } from "react-i18next";
import { lociToDomains, domainsToLoci } from "../../helpers/utility.js";
import Wrapper from "./index.style";
import settingsActions from "../../redux/settings/actions";

const { updateDomains } = settingsActions;

const margins = {};

class IgvPlot extends Component {
  container = null;
  igvBrowser = null;
  domains = [];

  constructor(props) {
    super(props);
    this.igvInitialized = false;
  }

  componentDidMount() {
    if (this.igvInitialized) return;
    this.igvInitialized = true;

    const { domains, chromoBins, url, indexURL, format, name } = this.props;

    const igvOptions = {
      genome: "hg19",
      locus: domainsToLoci(chromoBins, domains),
      tracks: [
        {
          name,
          url,
          indexURL,
          format,
        },
      ],
    };

    igv.createBrowser(this.container, igvOptions).then((browser) => {
      this.igvBrowser = browser;
      // Add location change listener
      this.igvBrowser.on("locuschange", this.handleLocusChange);
    });
  }

  shouldComponentUpdate(nextProps, nextState) {
    return nextProps.domains.toString() !== this.props.domains.toString();
  }

  componentDidUpdate() {
    const { domains, chromoBins } = this.props;
    if (domains.toString() !== this.domains.toString()) {
      this.igvBrowser.search(domainsToLoci(chromoBins, domains));
    }
  }

  componentWillUnmount() {
    if (this.igvBrowser) {
      this.igvBrowser.dispose();
      this.igvBrowser.off("locuschange", this.handleLocusChange);
      this.igvBrowser = null;
      this.igvInitialized = false;
    }
  }

  handleLocusChange = async () => {
    try {
      // Use getLocus() to fetch the current location from the IGV browser
      let loci = await this.igvBrowser.currentLoci();
      this.domains = lociToDomains(this.props.chromoBins, loci);
      this.props.updateDomains(this.domains);
    } catch (error) {
      console.error("Error retrieving locus:", error);
    }
  };

  render() {
    return (
      <Wrapper className="ant-wrapper" margins={margins}>
        <div className="igv-plot" ref={(elem) => (this.container = elem)} />
      </Wrapper>
    );
  }
}
IgvPlot.propTypes = {};
IgvPlot.defaultProps = {};
const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
});
const mapStateToProps = (state) => ({
  chromoBins: state.Settings.chromoBins,
  domains: state.Settings.domains,
});

// Prevent Hot Module Replacement for this component
if (module.hot) {
  module.hot.decline();
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(IgvPlot));
