// cancelToken.js
import axios from "axios";

// Initialize a single cancel token source
let cancelTokenSource = axios.CancelToken.source();

export const getCancelToken = () => cancelTokenSource.token;

export const cancelAllRequests = () => {
  // Cancel all requests and create a new token for future use
  cancelTokenSource.cancel("Operation canceled by the user.");
  cancelTokenSource = axios.CancelToken.source();
};
