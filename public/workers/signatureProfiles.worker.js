// signatureProfilesWorker.js
/* eslint-env worker */
/* eslint no-restricted-globals: "off" */

self.onmessage = function (e) {
  const { settings, datafiles, signaturesWeightsFiles } = e.data;

  try {
    let signatures = {};
    let signatureMetrics = {};

    const {
      types = [],
      modes = [],
      datafiles: configuredDatafiles = {},
    } = settings.signaturesList || {};

    // Build signatures structure
    types.forEach((type) => {
      signatures[type] = {};
      signatureMetrics[type] = {};
      modes.forEach((mode) => {
        signatures[type][mode] = {};
        signatureMetrics[type][mode] = {};
        (configuredDatafiles[type] || []).forEach((name) => {
          // Pre-create the buckets so we can push into them without extra checks
          signatures[type][mode][name] = [];
        });
      });
    });

    // Process signatures data
    datafiles.forEach((record) => {
      types.forEach((type) => {
        modes.forEach((mode) => {
          const signatureValues = record[`sigprofiler_${type}_${mode}`];
          if (!signatureValues) {
            return;
          }

          // Iterate each record only once per type/mode to avoid the OOM-causing nested re-scan
          Object.entries(signatureValues).forEach(([name, value]) => {
            const signatureBucket = signatures[type][mode][name];
            if (!signatureBucket) {
              // Ignore unexpected names to keep downstream processing stable
              return;
            }
            signatureBucket.push({
              pair: record.pair,
              tumor_type: record.tumor_type,
              value,
              sig: name,
            });
          });
        });
      });
    });

    // Calculate signature metrics (you'll need to implement getSignatureMetrics here or pass it)
    types.forEach((type) => {
      modes.forEach((mode) => {
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
