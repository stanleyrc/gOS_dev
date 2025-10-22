// signatureProfilesWorker.js
/* eslint-env worker */
/* eslint no-restricted-globals: "off" */

self.onmessage = function (e) {
  const { settings, datafiles, signaturesWeightsFiles } = e.data;

  try {
    let signatures = {};
    let signatureMetrics = [];

    // Build signatures structure
    let signaturesList = [];
    settings.signaturesList.types.forEach((type) => {
      signatures[type] = {};
      settings.signaturesList.modes.forEach((mode) => {
        signatures[type][mode] = {};
        settings.signaturesList.datafiles[type].forEach((name) => {
          signatures[type][mode][name] = [];
          signaturesList.push({
            type: type,
            mode: mode,
            name: name,
          });
        });
      });
    });

    // Process signatures data
    signaturesList.forEach((sig) => {
      let { type, mode } = sig;
      datafiles.forEach((record, i) => {
        Object.keys(record[`sigprofiler_${type}_${mode}`] || []).forEach(
          (name) => {
            if (signatures[type][mode][name]) {
              signatures[type][mode][name].push({
                pair: record.pair,
                tumor_type: record.tumor_type,
                value: record[`sigprofiler_${type}_${mode}`][name],
                sig: name,
              });
            }
          }
        );
      });
    });

    // Calculate signature metrics (you'll need to implement getSignatureMetrics here or pass it)
    settings.signaturesList.types.forEach((type) => {
      signatureMetrics[type] = {};
      settings.signaturesList.modes.forEach((mode) => {
        // Note: You'll need to copy the getSignatureMetrics function here
        // or implement a simplified version
        signatureMetrics[type][mode] = {}; // placeholder
      });
    });

    // Process signatures reference data
    let signaturesReference = {};

    // Fetch signature weights files and process them
    Promise.all(
      Object.keys(signaturesWeightsFiles).map((type) =>
        fetch(signaturesWeightsFiles[type]).then((response) => {
          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}: ${response.statusText} for ${signaturesWeightsFiles[type]}`
            );
          }
          return response.text();
        })
      )
    )
      .then((responses) => {
        responses.forEach((responseData, i) => {
          let weights = parseCosmicSignatureWeightMatrix(responseData);
          signaturesReference[Object.keys(signaturesWeightsFiles)[i]] = {};
          Object.keys(weights).forEach((name) => {
            signaturesReference[Object.keys(signaturesWeightsFiles)[i]][name] =
              Object.keys(weights[name]).map((tnc) => {
                return { value: weights[name][tnc], sig: name, tnc };
              });
          });
        });

        // Post result back to main thread
        self.postMessage({
          success: true,
          data: {
            signatures,
            signatureMetrics,
            signaturesReference,
          },
        });
      })
      .catch((error) => {
        console.log("got errors on loading signatures in worker", error);
        self.postMessage({
          success: false,
          error: error.message,
        });
      });

    // Helper function to parse COSMIC signature weight matrix (copied from utility)
    function parseCosmicSignatureWeightMatrix(matrixText) {
      const lines = matrixText.trim().split("\n");
      const headers = lines[0].split(/\s+/).slice(1);
      const matrix = {};

      headers.forEach((sig) => {
        if (sig !== "") {
          matrix[sig] = {};
        }
      });

      lines.slice(1).forEach((line) => {
        const [tnc, ...weights] = line.split(/\s+/);
        headers.forEach((sig, index) => {
          if (sig !== "") {
            matrix[sig][tnc] = parseFloat(weights[index]);
          }
        });
      });

      return matrix;
    }
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message,
    });
  }
};
