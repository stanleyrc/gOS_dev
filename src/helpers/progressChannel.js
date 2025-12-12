import { eventChannel, END } from "redux-saga";
import axios from "axios";

// Function to create an event channel for progress updates
export function createProgressChannel(config) {
  return eventChannel((emit) => {
    // Create a cancel token source for this request
    const source = axios.CancelToken.source();

    const onDownloadProgress = (progressEvent) => {
      const progress = Math.round(
        (progressEvent.loaded * 100) / progressEvent.total
      );
      emit(progress); // Emit the progress to the channel
    };

    // Make the Axios request with the progress callback
    axios
      .get(config.url, {
        cancelToken: source.token,
        responseType: config.responseType,
        onDownloadProgress,
      })
      .then((response) => {
        emit({ response }); // Emit the response once the download completes
        emit(END); // Close the channel
      })
      .catch((error) => {
        if (axios.isCancel(error)) {
          // Cancellation is not a "failure" from the UI perspective;
          // just end the channel quietly.
          emit(END);
        } else {
          emit({ error }); // Emit the error if the request fails
          emit(END); // Close the channel
        }
      });

    // The subscriber must return an unsubscribe function
    // Called when the saga closes the channel (e.g., due to cancellation)
    return () => {
      source.cancel("fetchCaseReports cancelled");
    };
  });
}
