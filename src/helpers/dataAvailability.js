export function isMissingDataError(error) {
  return error?.response?.status === 404;
}

export function isMissingDataResponse(response) {
  const contentType = response?.headers?.["content-type"];
  return typeof contentType === "string" && contentType.includes("text/html");
}
