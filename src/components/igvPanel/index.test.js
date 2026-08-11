/** @jest-environment node */

jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));
jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("react-in-viewport", () => (Component) => Component);
jest.mock("../igvPlot", () => "IgvPlot");
jest.mock("../../assets/images/igv-logo.png", () => "igv-logo.png");
jest.mock("../errorPanel", () => "ErrorPanel");
jest.mock("./index.style", () => "Wrapper");
jest.mock("html-to-image", () => ({}));
jest.mock("../../helpers/utility", () => ({
  domainsToLocation: jest.fn(() => ""),
  downloadCanvasAsPng: jest.fn(),
  transitionStyle: jest.fn(() => ({})),
}));
jest.mock("../../redux/settings/actions", () => ({
  __esModule: true,
  default: { updateDomains: jest.fn() },
}));

const { IgvPanel } = require("./index");

describe("IgvPanel initial visibility", () => {
  it("honors an expanded default supplied by its event-plots owner", () => {
    expect(new IgvPanel({ defaultVisible: true }).state.visible).toBe(true);
  });

  it("stays collapsed when no expanded default is supplied", () => {
    expect(new IgvPanel({}).state.visible).toBe(false);
  });
});
