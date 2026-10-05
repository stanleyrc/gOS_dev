// Client for the single-cell analysis service (services/sc-analysis).
// The base URL comes from the dataset's `analysisApi` setting, e.g. "sc-api/",
// resolved against the page so it works when gOS is served from a sub-path.
import axios from "axios";

export const analysisApiBase = (dataset) => {
  const base = dataset?.analysisApi;
  if (!base || typeof base !== "string") return null;
  return base.endsWith("/") ? base : `${base}/`;
};

const url = (base, path, query) => {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) params.set(k, v);
  });
  const qs = params.toString();
  return `${base}${path}${qs ? `?${qs}` : ""}`;
};

const errorMessage = (error) =>
  error?.response?.data?.error || error?.message || "request failed";

const call = async (promise) => {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    const wrapped = new Error(errorMessage(error));
    wrapped.status = error?.response?.status;
    throw wrapped;
  }
};

export const fetchCatalogue = (base) => call(axios.get(url(base, "catalogue")));

export const fetchRnaStatus = (base, dataset, patient) =>
  call(axios.get(url(base, "rna", { dataset, patient })));

export const searchGenes = (base, dataset, patient, q) =>
  call(axios.get(url(base, "genes", { dataset, patient, q })));

export const fetchExpression = (base, dataset, patient, gene) =>
  call(axios.get(url(base, "expression", { dataset, patient, gene })));

export const submitJob = (base, body) => call(axios.post(url(base, "jobs"), body));

export const fetchJob = (base, id) => call(axios.get(url(base, `jobs/${encodeURIComponent(id)}`)));

export const fetchJobResult = (base, id) =>
  call(axios.get(url(base, `jobs/${encodeURIComponent(id)}/result`)));

export const fetchHistory = (base, dataset, patient) =>
  call(axios.get(url(base, "jobs", { dataset, patient })));
