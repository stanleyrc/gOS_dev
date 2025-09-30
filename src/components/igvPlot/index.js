import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import igv from "../../../node_modules/igv/dist/igv.esm.min.js";
import { withTranslation } from "react-i18next";
import {
  parseCenterFromLocus,
  lociToDomains,
  domainToLoci,
} from "../../helpers/igvUtil.js";
import Wrapper from "./index.style";

const margins = {};

class IgvPlot extends Component {
  container = null;
  igvBrowser = null;
  domain = [];

  constructor(props) {
    super(props);
    this.igvInitialized = false;
    this.updateDomain = this.props.updateDomain;
  }

  componentDidMount() {
    if (this.igvInitialized) return;
    this.igvInitialized = true;

    const {
      domain,
      chromoBins,
      urlTumor,
      indexTumorURL,
      urlNormal,
      indexNormalURL,
      filenameTumorPresent,
      filenameNormalPresent,
      format,
    } = this.props;
    let locus = domainToLoci(chromoBins, domain);
    const { chr, position } = parseCenterFromLocus(locus);
    let tracks = [];
    if (filenameTumorPresent) {
      tracks.push({
        id: "Tumor",
        name: "Tumor",
        url: urlTumor,
        indexURL: indexTumorURL,
        format,
        type: "alignment",
        sort: [{ chr, position, option: "BASE", direction: "ASC" }],
      });
    }
    if (filenameNormalPresent) {
      tracks.push({
        id: "normal",
        name: "Normal",
        url: urlNormal,
        indexURL: indexNormalURL,
        format,
        type: "alignment",
        sort: [{ chr, position, option: "BASE", direction: "ASC" }],
      });
    }
    const igvOptions = {
      genome: "hg19",
      locus,
      minimumBases: 1,
      tracks,
      showCenterGuide: true,
    };

    igv.createBrowser(this.container, igvOptions).then((browser) => {
      this.igvBrowser = browser;
      // Add location change listener
      this.igvBrowser.on("locuschange", this.handleLocusChange);
      // Initial sort on mount by center base
      this.sortAlignmentTracksByCenter(chr, position);
    });
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.domain.toString() !== this.props.domain.toString() ||
      nextProps.urlTumor?.toString() !== this.props.urlTumor?.toString()
    );
  }

  componentDidUpdate() {
    const { domain, chromoBins } = this.props;
    if (this.igvBrowser && domain.toString() !== this.domain.toString()) {
      let locus = domainToLoci(chromoBins, domain);
      this.igvBrowser.search(locus);
      // After moving, default-sort tracks by base at the window center
      const { chr, position } = parseCenterFromLocus(locus);
      this.sortAlignmentTracksByCenter(chr, position);
    }
  }

  // Apply BASE sort at the given center to all alignment tracks
  sortAlignmentTracksByCenter(chr, position) {
    if (!this.igvBrowser || !chr || !position) return;
    try {
      const tracks = this.igvBrowser.findTracks
        ? this.igvBrowser.findTracks("type", "alignment")
        : [];
      tracks.forEach((track) => {
        if (track && typeof track.sort === "function") {
          track.sort({ chr, position, option: "BASE", direction: "ASC" });
        }
      });
    } catch (e) {
      //console.error("Error sorting alignment tracks:", e);
      // Best-effort; ignore errors
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
      this.updateDomain(this.domain, this.props.index);
      // Keep alignment tracks sorted by the center base on user navigation
      const { chr, position } = parseCenterFromLocus(locus);
      this.sortAlignmentTracksByCenter(chr, position);
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
