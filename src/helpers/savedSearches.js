import { guid } from "./utility";

export const SAVED_SEARCHES_STORAGE_KEY = "gos.savedSearches.v1";

export const getSavedSearchesStorageKey = (ownerId) => {
  const normalizedOwnerId =
    typeof ownerId === "string" ? ownerId.trim() : "";
  return normalizedOwnerId
    ? `${SAVED_SEARCHES_STORAGE_KEY}.${encodeURIComponent(normalizedOwnerId)}`
    : SAVED_SEARCHES_STORAGE_KEY;
};

export const normalizeSavedSearch = (savedSearch = {}) => {
  if (!savedSearch.id || !savedSearch.createdAt) return null;

  const numericResultCount = Number(savedSearch.resultCount);
  const resultCount =
    savedSearch.resultCount == null ||
    savedSearch.resultCount === "" ||
    !Number.isFinite(numericResultCount)
      ? null
      : numericResultCount;

  return {
    id: `${savedSearch.id}`,
    searchId: `${savedSearch.searchId || savedSearch.id}`,
    name: savedSearch.name || "Saved query",
    description: savedSearch.description || "",
    resultCount,
    searchFilters: savedSearch.searchFilters || {},
    datasetId:
      savedSearch.datasetId == null ? null : `${savedSearch.datasetId}`,
    createdAt: savedSearch.createdAt,
    updatedAt: savedSearch.updatedAt || savedSearch.createdAt,
  };
};

export const sortSavedSearches = (savedSearches = []) =>
  [...savedSearches].sort(
    (left, right) =>
      new Date(right.updatedAt || right.createdAt || 0).getTime() -
      new Date(left.updatedAt || left.createdAt || 0).getTime(),
  );

export const parseSavedSearches = (rawValue) => {
  if (!rawValue) return [];

  try {
    const value = JSON.parse(rawValue);
    if (!Array.isArray(value)) return [];
    return sortSavedSearches(
      value.map((savedSearch) => normalizeSavedSearch(savedSearch)).filter(Boolean),
    );
  } catch (error) {
    return [];
  }
};

export const getBrowserStorage = () =>
  typeof window !== "undefined" ? window.localStorage : null;

export const readSavedSearches = (
  storage = getBrowserStorage(),
  ownerId = null,
) => {
  if (!storage) return [];
  return parseSavedSearches(
    storage.getItem(getSavedSearchesStorageKey(ownerId)),
  );
};

export const writeSavedSearches = (
  savedSearches,
  storage = getBrowserStorage(),
  ownerId = null,
) => {
  if (!storage) return;
  storage.setItem(
    getSavedSearchesStorageKey(ownerId),
    JSON.stringify(sortSavedSearches(savedSearches)),
  );
};

export const upsertSavedSearch = (
  savedSearch,
  existingSavedSearches = [],
  now = new Date().toISOString(),
) => {
  const existing = savedSearch.id
    ? existingSavedSearches.find((candidate) => candidate.id === savedSearch.id)
    : null;
  const id = existing?.id || savedSearch.id || `saved-query-${guid()}`;
  const normalized = normalizeSavedSearch({
    ...existing,
    ...savedSearch,
    id,
    searchId: savedSearch.searchId || existing?.searchId || id,
    createdAt: savedSearch.createdAt || existing?.createdAt || now,
    updatedAt: now,
  });

  return {
    savedSearch: normalized,
    savedSearches: sortSavedSearches([
      normalized,
      ...existingSavedSearches.filter((candidate) => candidate.id !== id),
    ]),
  };
};

export const deleteSavedSearch = (savedSearches = [], savedSearchId) =>
  savedSearches.filter((savedSearch) => savedSearch.id !== savedSearchId);

export const formatSavedSearchResultCount = (resultCount) => {
  const numericResultCount = Number(resultCount);
  return resultCount == null ||
    resultCount === "" ||
    !Number.isFinite(numericResultCount)
    ? ""
    : new Intl.NumberFormat().format(numericResultCount);
};

export const buildSavedSearchDescriptionParts = ({
  description = "",
  resultCount = null,
  t,
}) => {
  const bodyText = `${description}`.replace(/>=/g, "≥").replace(/<=/g, "≤");
  const countLabel = formatSavedSearchResultCount(resultCount);
  const countNounText = countLabel
    ? t("containers.list-view.favorites.description.count-only-noun", {
        count: Number(resultCount),
      })
    : "";
  const countText = countLabel
    ? t("containers.list-view.favorites.description.count-only", {
        count: Number(resultCount),
      })
    : "";

  return {
    bodyText,
    countLabel,
    countNounText,
    countText,
    fullText: [countText, bodyText].filter(Boolean).join(" "),
  };
};
