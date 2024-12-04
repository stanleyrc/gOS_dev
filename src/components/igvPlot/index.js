import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import igv from "../../../node_modules/igv/dist/igv.esm.min.js";
import { withTranslation } from "react-i18next";
import { lociToDomains, domainToLoci } from "../../helpers/utility.js";
import Wrapper from "./index.style";

const margins = {};

class IgvPlot extends Component {
  container = null;
  igvBrowser = null;
  domain = [];

  constructor(props) {
    super(props);
    this.igvInitialized = false;
  }

  componentDidMount() {
    if (this.igvInitialized) return;
    this.igvInitialized = true;

    const { domain, chromoBins, url, indexURL, format, name } = this.props;

    const igvOptions = {
      genome: "hg19",
      locus: domainToLoci(chromoBins, domain),
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
    return nextProps.domain.toString() !== this.props.domain.toString();
  }

  componentDidUpdate() {
    const { domain, chromoBins } = this.props;
    if (this.igvBrowser && domain.toString() !== this.domain.toString()) {
      this.igvBrowser.search(domainToLoci(chromoBins, domain));
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
      this.domain = lociToDomains(this.props.chromoBins, loci)[0];
      this.props.updateDomain(this.domain, this.props.index);
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
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});

// Prevent Hot Module Replacement for this component
if (module.hot) {
  module.hot.decline();
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(IgvPlot));
