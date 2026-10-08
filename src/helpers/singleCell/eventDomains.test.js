import { padDomains } from "./eventDomains";

describe("padDomains", () => {
  it("pads each locus and clamps to the genome", () => {
    expect(padDomains([[1100000, 1200000]], 50000, 2000000)).toEqual([[1050000, 1250000]]);
    expect(padDomains([[10, 20], [1999990, 1999999]], 50000, 2000000)).toEqual([[1, 50020], [1949990, 2000000]]);
    expect(padDomains([], 50000, 2000000)).toBeNull();
  });
});
