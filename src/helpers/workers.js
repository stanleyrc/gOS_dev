// Web Worker helper functions

/**
 * Generic Web Worker processor
 * @param {Object} data - The data to send to the worker
 * @param {string} workerUrl - The URL/path to the worker file
 * @returns {Promise} Promise that resolves with worker result
 */
export function processDataInWorker(data, workerUrl) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);

    worker.onmessage = (e) => {
      const { success, data: result, error } = e.data;
      worker.terminate(); // Clean up worker

      if (success) {
        resolve(result);
      } else {
        reject(new Error(error));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    worker.postMessage(data);
  });
}
