/** @jest-environment node */

jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));
jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("../../../node_modules/igv/dist/igv.esm.min.js", () => ({
  createBrowser: jest.fn(),
}));
jest.mock("./index.style", () => "Wrapper");
jest.mock("../../helpers/utility.js", () => ({
  locationToDomains: jest.fn(),
}));

const igv = require("../../../node_modules/igv/dist/igv.esm.min.js");
const { locationToDomains } = require("../../helpers/utility.js");
const { IgvPlot } = require("./index");

const trackCases = [
  ["filenameTumorPresent", "Tumor", "Tumor", "tumor"],
  ["filenameNormalPresent", "normal", "Normal", "normal"],
  ["filenameTumorRnaPresent", "Tumor RNA", "Tumor RNA", "tumor-rna"],
  ["filenameNormalRnaPresent", "Normal RNA", "Normal RNA", "normal-rna"],
];
const initialSort = {
  chr: "chr17",
  position: 150,
  option: "BASE",
  direction: "ASC",
};
const expectedTracks = trackCases.map(([, id, name, filename]) => ({
  id,
  name,
  url: `/alignments/${filename}.bam`,
  indexURL: `/alignments/${filename}.bam.bai`,
  format: "bam",
  type: "alignment",
  colorBy: "strand",
  sort: [initialSort],
}));

function makeProps(overrides = {}) {
  return {
    genomeList: [{ id: "hg19" }],
    domain: [99, 199],
    chromoBins: {
      17: { startPlace: 0, endPlace: 1000, startPoint: 1, endPoint: 1001 },
    },
    index: 2,
    updateDomain: jest.fn(),
    format: "bam",
    urlTumor: "/alignments/tumor.bam",
    indexTumorURL: "/alignments/tumor.bam.bai",
    urlNormal: "/alignments/normal.bam",
    indexNormalURL: "/alignments/normal.bam.bai",
    urlTumorRna: "/alignments/tumor-rna.bam",
    indexTumorRnaURL: "/alignments/tumor-rna.bam.bai",
    urlNormalRna: "/alignments/normal-rna.bam",
    indexNormalRnaURL: "/alignments/normal-rna.bam.bai",
    filenameTumorPresent: true,
    filenameNormalPresent: true,
    filenameTumorRnaPresent: true,
    filenameNormalRnaPresent: true,
    ...overrides,
  };
}

describe("IgvPlot alignment track defaults", () => {
  let browser;
  let liveTracks;

  beforeEach(() => {
    jest.clearAllMocks();
    browser = {
      on: jest.fn(),
      off: jest.fn(),
      dispose: jest.fn(),
      search: jest.fn(),
      currentLoci: jest.fn().mockResolvedValue("chr17:300-400"),
      findTracks: jest.fn(() => liveTracks),
    };
    igv.createBrowser.mockImplementation((container, options) => {
      liveTracks = options.tracks.map((track) => ({
        ...track,
        sort: jest.fn(),
      }));
      return Promise.resolve(browser);
    });
    locationToDomains.mockReturnValue([[299, 399]]);
  });

  it("starts all four DNA/RNA tumor/normal tracks with read-strand coloring and BASE sorting", async () => {
    const props = makeProps();
    const plot = new IgvPlot(props);
    plot.container = {};

    plot.componentDidMount();
    await Promise.resolve();

    expect(igv.createBrowser).toHaveBeenCalledTimes(1);
    expect(igv.createBrowser).toHaveBeenCalledWith(plot.container, {
      genome: "hg19",
      genomeList: props.genomeList,
      loadDefaultGenomes: false,
      locus: "chr17:100-200",
      minimumBases: 1,
      tracks: expectedTracks,
      showCenterGuide: true,
    });
    expect(browser.on).toHaveBeenCalledWith("locuschange", plot.handleLocusChange);
    expect(browser.findTracks).toHaveBeenCalledWith("type", "alignment");
    liveTracks.forEach((track) => {
      expect(track.sort).toHaveBeenCalledWith(initialSort);
    });

    plot.componentWillUnmount();
    expect(browser.off).toHaveBeenCalledWith("locuschange", plot.handleLocusChange);
    expect(browser.dispose).toHaveBeenCalledTimes(1);
  });

  describe.each([false, undefined])("when a presence flag is %s", (absent) => {
    it.each(trackCases)("omits %s and preserves the other track configurations", async (flag, id) => {
      const plot = new IgvPlot(makeProps({ [flag]: absent }));

      plot.componentDidMount();
      await Promise.resolve();

      expect(igv.createBrowser.mock.calls[0][1].tracks).toEqual(
        expectedTracks.filter((track) => track.id !== id),
      );
      plot.componentWillUnmount();
    });
  });

  it("creates no alignment tracks when all four presence flags are false", async () => {
    const flags = Object.fromEntries(trackCases.map(([flag]) => [flag, false]));
    const plot = new IgvPlot(makeProps(flags));

    plot.componentDidMount();
    await Promise.resolve();

    expect(igv.createBrowser.mock.calls[0][1].tracks).toEqual([]);
    plot.componentWillUnmount();
  });

  it("preserves navigation and BASE sorting without resetting a manual color choice", async () => {
    const plot = new IgvPlot(makeProps());
    plot.componentDidMount();
    await Promise.resolve();
    liveTracks.forEach((track) => {
      track.colorBy = "firstOfPairStrand";
    });

    plot.props = { ...plot.props, domain: [199, 299] };
    plot.componentDidUpdate();

    expect(browser.search).toHaveBeenCalledWith("chr17:200-300");
    liveTracks.forEach((track) => {
      expect(track.sort).toHaveBeenLastCalledWith({ ...initialSort, position: 250 });
    });

    await plot.handleLocusChange();

    expect(locationToDomains).toHaveBeenCalledWith(
      plot.props.chromoBins,
      "17:300-17:400",
    );
    expect(plot.props.updateDomain).toHaveBeenCalledWith([299, 399], 2);
    liveTracks.forEach((track) => {
      expect(track.sort).toHaveBeenLastCalledWith({ ...initialSort, position: 350 });
      expect(track.colorBy).toBe("firstOfPairStrand");
    });
    expect(igv.createBrowser).toHaveBeenCalledTimes(1);
    plot.componentWillUnmount();
  });
});
