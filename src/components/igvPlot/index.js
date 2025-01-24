import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import debounce from "lodash.debounce";
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
    this.debouncedUpdateDomain = debounce(this.props.updateDomain, 10);
  }

  componentDidMount() {
    if (this.igvInitialized) return;
    this.igvInitialized = true;

    const { domain, chromoBins, url, indexURL, format, name } = this.props;
    let locus = domainToLoci(chromoBins, domain);
    const igvOptions = {
      genome: "hg19",
      locus,
      tracks: [
        {
          id: name,
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
    return (
      nextProps.domain.toString() !== this.props.domain.toString() ||
      nextProps.url.toString() !== this.props.url.toString()
    );
  }

  componentDidUpdate() {
    const { domain, chromoBins } = this.props;
    if (this.igvBrowser && domain.toString() !== this.domain.toString()) {
      let locus = domainToLoci(chromoBins, domain);
      this.igvBrowser.search(locus);
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
      let locus = await this.igvBrowser.currentLoci();
      this.domain = lociToDomains(this.props.chromoBins, locus)[0];
      this.debouncedUpdateDomain(this.domain, this.props.index);
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
