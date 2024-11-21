import React, { Component } from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import handleViewport from "react-in-viewport";
import { Card, Space } from "antd";
import { withRouter } from 'react-router-dom';
import { GiDna2 } from "react-icons/gi";
import { transitionStyle, domainsToLocation } from "../../helpers/utility";
import Wrapper from "./index.style";

class IGVPanel extends Component {
  igvBrowser = null;

  // Add new helper function to format location for IGV
  formatLocationForIGV = (location) => {
    // Handle case where there are multiple locations separated by |
    return location.split('|').map(loc => {
      // Split on the hyphen to get start and end parts
      const [start, end] = loc.split('-');
      
      // Extract chromosome number and position from start
      const [chrStart, posStart] = start.split(':');
      // Extract chromosome number and position from end
      const [chrEnd, posEnd] = end.split(':');
      
      // Verify both parts refer to same chromosome
      if (chrStart !== chrEnd) {
        console.warn('Cross-chromosome regions not supported');
        return null;
      }
      
      // Return in IGV format
      return `chr${chrStart}:${posStart}-${posEnd}`;
    })
    .filter(Boolean) // Remove any null entries
    .join('|'); // Rejoin multiple locations if they exist
    this.igvBrowser.on('locuschange', this.handleLocationChange);
  }

  handleLocationChange = (event) => {
    const { history, location } = this.props;
    
    // Get the current location from IGV
    if (!this.igvBrowser) return;

    try {
      // Get the current genomic region
      const loci = this.igvBrowser.search(); // This returns the current search string
      if (!loci) return;

      // Parse the locus string (format: "chr1:1234-5678")
      const [chrom, range] = loci.split(':');
      if (!range) return;
      
      const [start, end] = range.split('-').map(Number);
      if (!start || !end) return;

      // Create new URL search params preserving other parameters
      const searchParams = new URLSearchParams(location.search);
      searchParams.set('chr', chrom.replace('chr', '')); // Remove 'chr' prefix
      searchParams.set('start', start);
      searchParams.set('end', end);
      
      // Update URL without reloading the page
      history.push({
        ...location,
        search: searchParams.toString()
      });
    } catch (error) {
      console.error('Error parsing locus:', error);
    }
  }

  initializeBrowser = () => {
    if (this.igvBrowser) return;
    
    const igvDiv = document.getElementById("igv-div");
    if (!window.igv || !igvDiv) {
      console.error('IGV library or div not loaded');
      return;
    }

    // Get location from domains and format it for IGV
    const rawLocation = domainsToLocation(this.props.chromoBins, this.props.domains);
    const formattedLocation = this.formatLocationForIGV(rawLocation);
    console.log('IGV formatted location:', formattedLocation);
    console.log( `${window.location.origin}/data/${this.props.pair}/tumor.bam`)

    const options = {
      genome: "hg38",
      locus: formattedLocation,
      tracks: [
        {
          name: this.props.pair,
          url: `${window.location.origin}/data/${this.props.pair}/tumor.bam`,
          indexURL: `${window.location.origin}/data/${this.props.pair}/tumor.bam.bai`,
          format: "bam"
        }
      ]
    };

    window.igv.createBrowser(igvDiv, options)
      .then(browser => {
        this.igvBrowser = browser;
        // Add location change listener
        this.igvBrowser.on('locuschange', this.handleLocationChange);
      
        console.log("Created IGV browser");
      })
      .catch(error => {
        console.error('Error creating IGV browser:', error);
      });
  }

  componentDidUpdate(prevProps) {
    // Initialize when component becomes visible
    if (!prevProps.inViewport && this.props.inViewport) {
      this.initializeBrowser();
    }
    if (this.igvBrowser && 
        (prevProps.domains !== this.props.domains || 
         prevProps.chromoBins !== this.props.chromoBins)) {
      const rawLocation = domainsToLocation(this.props.chromoBins, this.props.domains);
      const formattedLocation = this.formatLocationForIGV(rawLocation);
      this.igvBrowser.search(formattedLocation);
    }
  }

  componentWillUnmount() {
    if (this.igvBrowser) {
      // Remove the location change listener
      this.igvBrowser.off('locuschange', this.handleLocationChange);
      
      this.igvBrowser = null;
    }
  }
  
  render() {
    const {
      t,
      title,
      inViewport,
      renderOutsideViewPort,
      visible,
      chromoBins,
      domains,
    } = this.props;

    return (
      <Wrapper visible={visible}>
        <Card
          style={transitionStyle(inViewport || renderOutsideViewPort)}
          size="large"
          title={
            <Space>
              <span role="img" className="anticon anticon-dashboard">
                <GiDna2 />
              </span>
              <span className="ant-pro-menu-item-title">{title}</span>
              <span>{domainsToLocation(chromoBins, domains)}</span>
            </Space>
          }
        >
          <div id="igv-div" style={{ padding: '10px', height: '600px' }}></div>
        </Card>
      </Wrapper>
    );
  }
}

IGVPanel.defaultProps = {
  visible: true,
};

const mapStateToProps = (state) => ({
  renderOutsideViewPort: state.App.renderOutsideViewPort,
  domains: state.Settings.domains,
  chromoBins: state.Settings.chromoBins,
  pair: state.CaseReport.metadata?.pair // Add this line
});

export default withRouter(
  connect(
    mapStateToProps,
    null
  )(withTranslation("common")(handleViewport(IGVPanel, { rootMargin: "-1.0px" })))
);
