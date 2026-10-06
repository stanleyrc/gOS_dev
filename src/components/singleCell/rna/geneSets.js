// Gene-set collections served from the app's genesets/ folder (index.json +
// GMT files, exported from MSigDB), loaded once per session.
import axios from "axios";
import { parseGmt } from "../../../helpers/singleCell/rnaStats";

let indexPromise = null;
export const geneSetIndex = () => {
  if (!indexPromise) {
    indexPromise = axios.get("genesets/index.json").then((r) => r.data);
    indexPromise.catch(() => (indexPromise = null));
  }
  return indexPromise;
};

const gmtCache = new Map();
export const loadGmt = (file) => {
  if (!gmtCache.has(file)) {
    const p = axios
      .get(`genesets/${file}`, { responseType: "text", transformResponse: [(d) => d] })
      .then((r) => parseGmt(r.data));
    p.catch(() => gmtCache.delete(file));
    gmtCache.set(file, p);
  }
  return gmtCache.get(file);
};

export const prettyTerm = (term) => term.replace(/^HALLMARK_|^REACTOME_|^GOBP_/, "").replace(/_/g, " ");
