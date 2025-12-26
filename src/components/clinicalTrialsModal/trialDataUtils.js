import { TIME_CONVERSION, PERCENTAGE_UNITS, TIME_UNITS, SOC_CLASSES, parseBiomarkerFilter } from "./constants";

/**
 * Validate outcome unit based on outcome type
 */
export function isValidOutcome(outcome, outcomeType) {
  if (outcome.value == null) return false;
  const unitLower = (outcome.unit || "").toLowerCase();

  if (outcomeType === "ORR") {
    return PERCENTAGE_UNITS.some((w) => unitLower.includes(w));
  }

  if (outcomeType === "PFS" || outcomeType === "OS") {
    if (PERCENTAGE_UNITS.some((w) => unitLower.includes(w))) {
      return false;
    }
    return TIME_UNITS.some((w) => unitLower.includes(w));
  }

  return false;
}

/**
 * Normalize time values to months
 */
export function normalizeToMonths(value, unit) {
  if (value == null || value === undefined) return null;
  if (!unit) return value;

  const unitLower = unit.toLowerCase().trim();

  if (unitLower.includes("month")) return value;
  if (unitLower.includes("day")) return value / TIME_CONVERSION.DAYS_PER_MONTH;
  if (unitLower.includes("week")) return value / TIME_CONVERSION.WEEKS_PER_MONTH;
  if (unitLower.includes("year")) return value * TIME_CONVERSION.MONTHS_PER_YEAR;

  return value;
}

/**
 * Parse completion date string to decimal year
 */
export function parseCompletionYear(dateStr) {
  if (!dateStr) return null;

  // Year only: add 0.5 offset
  if (dateStr.match(/^\d{4}$/)) {
    return parseInt(dateStr, 10) + 0.5;
  }

  // Year-month: convert to decimal year
  if (dateStr.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = dateStr.split("-");
    return parseInt(year, 10) + (parseInt(month, 10) - 0.5) / 12;
  }

  // Full date: convert to precise decimal year
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split("-");
    const monthDecimal = (parseInt(month, 10) - 1) / 12;
    const dayDecimal = (parseInt(day, 10) - 1) / 365;
    return parseInt(year, 10) + monthDecimal + dayDecimal;
  }

  return null;
}

/**
 * Create a unique key for a point to avoid duplicates
 */
export function createPointKey(trial, outcome) {
  return `${trial.nct_id}|${outcome.arm_title}|${outcome.outcome_type}`;
}

/**
 * Check if a treatment class is Standard of Care
 */
export function isStandardOfCareTreatment(treatmentClass) {
  return SOC_CLASSES.includes(treatmentClass);
}

/**
 * Create a point object from trial and outcome
 */
export function createPoint(trial, outcome, isORR) {
  const rawValue = parseFloat(outcome.value);
  if (isNaN(rawValue)) return null;

  const value = isORR ? rawValue : normalizeToMonths(rawValue, outcome.unit);
  const ciLower = isORR ? outcome.ci_lower : normalizeToMonths(outcome.ci_lower, outcome.unit);
  const ciUpper = isORR ? outcome.ci_upper : normalizeToMonths(outcome.ci_upper, outcome.unit);

  // Skip negative values after normalization
  if (value < 0) return null;

  const year = parseCompletionYear(trial.completion_date);
  if (!year || isNaN(year)) return null;

  const armId = outcome.arm_id || "";
  const armTitle = outcome.arm_title || "";
  const treatmentClass = trial.treatment_class_map?.[armId] || "OTHER";

  return {
    x: year,
    y: value,
    trial,
    outcome,
    treatmentClass,
    armTitle,
    nctId: trial.nct_id,
    ciLower: ciLower != null && ciLower >= 0 ? ciLower : null,
    ciUpper: ciUpper != null && ciUpper >= 0 ? ciUpper : null,
  };
}

/**
 * Collect points from trials with optional SoC filtering
 * @param {Array} trials - Filtered trials
 * @param {string} outcomeType - 'PFS', 'OS', or 'ORR'
 * @param {Object} options
 * @param {Array} options.allTrials - All trials (unfiltered)
 * @param {string} options.socDisplayMode - 'hide', 'filtered', or 'all'
 * @param {Array} options.cancerTypeFilters - Cancer types to filter SoC by (for 'filtered' mode)
 * @param {boolean} options.excludeAdjuvant - Exclude adjuvant/neoadjuvant trials
 */
export function collectTrialPoints(trials, outcomeType, options = {}) {
  const {
    allTrials = null,
    socDisplayMode = 'hide',
    cancerTypeFilters = [],
    excludeAdjuvant = false,
  } = options;

  const points = [];
  const socPoints = [];
  const addedSocKeys = new Set();
  const isORR = outcomeType === "ORR";

  // Collect SoC points based on display mode
  if (socDisplayMode !== 'hide' && allTrials) {
    allTrials.forEach((trial) => {
      if (excludeAdjuvant &&
          (trial.line_of_therapy === "ADJUVANT" || trial.line_of_therapy === "NEOADJUVANT")) {
        return;
      }

      // In 'filtered' mode, only include SoC from matching cancer types
      if (socDisplayMode === 'filtered' && cancerTypeFilters.length > 0) {
        const hasMatchingCancerType = cancerTypeFilters.some((ct) =>
          (trial.cancer_types || []).includes(ct)
        );
        if (!hasMatchingCancerType) return;
      }

      if (!trial.completion_date) return;

      const validOutcomes = (trial.outcomes || []).filter(
        (o) => o.outcome_type === outcomeType && isValidOutcome(o, outcomeType)
      );
      if (validOutcomes.length === 0) return;

      validOutcomes.forEach((outcome) => {
        const armId = outcome.arm_id || "";
        const treatmentClass = trial.treatment_class_map?.[armId] || "OTHER";

        if (!isStandardOfCareTreatment(treatmentClass)) return;

        const key = createPointKey(trial, outcome);
        addedSocKeys.add(key);

        const point = createPoint(trial, outcome, isORR);
        if (point) {
          socPoints.push(point);
        }
      });
    });
  }

  // Add points from filtered trials
  trials.forEach((trial) => {
    if (!trial.completion_date) return;

    const year = parseCompletionYear(trial.completion_date);
    if (!year || isNaN(year)) return;

    const outcomes = (trial.outcomes || []).filter(
      (o) => o.outcome_type === outcomeType && isValidOutcome(o, outcomeType)
    );
    if (outcomes.length === 0) return;

    outcomes.forEach((outcome) => {
      const key = createPointKey(trial, outcome);
      if (addedSocKeys.has(key)) return;

      const point = createPoint(trial, outcome, isORR);
      if (point) {
        points.push(point);
      }
    });
  });

  return socDisplayMode !== 'hide' ? [...socPoints, ...points] : points;
}

/**
 * Group outcomes by arm_id for arm-level aggregation
 */
function groupOutcomesByArm(outcomes) {
  const grouped = {};
  outcomes.forEach((outcome) => {
    const armId = outcome.arm_id || '_default';
    if (!grouped[armId]) grouped[armId] = [];
    grouped[armId].push(outcome);
  });
  return grouped;
}

/**
 * Find a valid outcome of specified type from outcomes array
 */
function findValidOutcome(outcomes, outcomeType) {
  return outcomes.find((o) =>
    o.outcome_type === outcomeType && isValidOutcome(o, outcomeType)
  );
}

/**
 * Create a point for outcome-vs-outcome plot
 */
function createDualOutcomePoint(trial, xOutcome, yOutcome, xOutcomeType, yOutcomeType) {
  const isXORR = xOutcomeType === 'ORR';
  const isYORR = yOutcomeType === 'ORR';

  const xRaw = parseFloat(xOutcome.value);
  const yRaw = parseFloat(yOutcome.value);
  if (isNaN(xRaw) || isNaN(yRaw)) return null;

  const xValue = isXORR ? xRaw : normalizeToMonths(xRaw, xOutcome.unit);
  const yValue = isYORR ? yRaw : normalizeToMonths(yRaw, yOutcome.unit);

  if (xValue < 0 || yValue < 0) return null;

  const armId = xOutcome.arm_id || yOutcome.arm_id || '';
  const armTitle = xOutcome.arm_title || yOutcome.arm_title || '';
  const treatmentClass = trial.treatment_class_map?.[armId] || 'OTHER';

  // CI only for Y-axis
  const ciLower = isYORR ? yOutcome.ci_lower : normalizeToMonths(yOutcome.ci_lower, yOutcome.unit);
  const ciUpper = isYORR ? yOutcome.ci_upper : normalizeToMonths(yOutcome.ci_upper, yOutcome.unit);

  return {
    x: xValue,
    y: yValue,
    trial,
    xOutcome,
    yOutcome,
    outcome: yOutcome, // Backward compatibility
    treatmentClass,
    armTitle,
    nctId: trial.nct_id,
    ciLower: ciLower != null && ciLower >= 0 ? ciLower : null,
    ciUpper: ciUpper != null && ciUpper >= 0 ? ciUpper : null,
    xOutcomeType,
    yOutcomeType,
  };
}

/**
 * Collect points where both X and Y are outcome measurements
 */
function collectOutcomeVsOutcomePoints(trials, xOutcomeType, yOutcomeType, options = {}) {
  const { allTrials, socDisplayMode, cancerTypeFilters, excludeAdjuvant } = options;
  const points = [];
  const socPoints = [];
  const addedSocKeys = new Set();

  const processTrials = (trialList, isSocPass = false) => {
    trialList.forEach((trial) => {
      if (excludeAdjuvant &&
          (trial.line_of_therapy === 'ADJUVANT' || trial.line_of_therapy === 'NEOADJUVANT')) {
        return;
      }

      const outcomesByArm = groupOutcomesByArm(trial.outcomes || []);

      for (const [armId, armOutcomes] of Object.entries(outcomesByArm)) {
        const xOutcome = findValidOutcome(armOutcomes, xOutcomeType);
        const yOutcome = findValidOutcome(armOutcomes, yOutcomeType);

        if (!xOutcome || !yOutcome) continue;

        const treatmentClass = trial.treatment_class_map?.[armId] || 'OTHER';

        if (isSocPass && !isStandardOfCareTreatment(treatmentClass)) continue;

        const key = `${trial.nct_id}|${armId}|${xOutcomeType}|${yOutcomeType}`;
        if (addedSocKeys.has(key)) continue;
        if (isSocPass) addedSocKeys.add(key);

        const point = createDualOutcomePoint(trial, xOutcome, yOutcome, xOutcomeType, yOutcomeType);
        if (point) {
          (isSocPass ? socPoints : points).push(point);
        }
      }
    });
  };

  // Process SoC from allTrials if applicable
  if (socDisplayMode !== 'hide' && allTrials) {
    const socTrials = allTrials.filter((trial) => {
      if (socDisplayMode === 'filtered' && cancerTypeFilters.length > 0) {
        return cancerTypeFilters.some((ct) => (trial.cancer_types || []).includes(ct));
      }
      return true;
    });
    processTrials(socTrials, true);
  }

  processTrials(trials, false);

  return socDisplayMode !== 'hide' ? [...socPoints, ...points] : points;
}

/**
 * Collect points for dual-axis scatter plot
 * @param {Array} trials - Filtered trials
 * @param {string} xAxisType - 'TIME', 'PFS', 'OS', or 'ORR'
 * @param {string} yAxisType - 'PFS', 'OS', or 'ORR'
 * @param {Object} options - Same as collectTrialPoints
 */
export function collectTrialPointsDualAxis(trials, xAxisType, yAxisType, options = {}) {
  // If X is Time, use existing function
  if (xAxisType === 'TIME') {
    return collectTrialPoints(trials, yAxisType, options);
  }

  // Both axes are outcomes
  return collectOutcomeVsOutcomePoints(trials, xAxisType, yAxisType, options);
}

/**
 * Check if a trial matches biomarker filter queries
 */
export function trialMatchesBiomarkerFilter(trial, biomarkerFilters) {
  if (biomarkerFilters.length === 0) return true;

  const queries = parseBiomarkerFilter(biomarkerFilters.join(","));

  return queries.every((query) => {
    return trial.biomarkers?.some((b) => {
      if (!b.target.toUpperCase().includes(query.target)) return false;
      if (query.status) {
        const effectiveStatus = b.status === "HIGH" || b.status === "LOW" ? "POSITIVE" : b.status;
        return effectiveStatus === query.status;
      }
      return true;
    });
  });
}

/**
 * Check if filtered trials have any valid outcomes across all outcome types
 */
export function hasAnyOutcomes(trials) {
  const outcomeTypes = ["PFS", "OS", "ORR"];

  for (const trial of trials) {
    if (!trial.completion_date) continue;

    for (const outcomeType of outcomeTypes) {
      const validOutcomes = (trial.outcomes || []).filter(
        (o) => o.outcome_type === outcomeType && isValidOutcome(o, outcomeType)
      );
      if (validOutcomes.length > 0) return true;
    }
  }

  return false;
}

/**
 * Get which outcome types have valid data for the given trials
 * Returns an object like { PFS: true, OS: false, ORR: true }
 */
export function getAvailableOutcomeTypes(trials) {
  const outcomeTypes = ["PFS", "OS", "ORR"];
  const available = {};

  for (const outcomeType of outcomeTypes) {
    available[outcomeType] = trials.some((trial) => {
      if (!trial.completion_date) return false;
      return (trial.outcomes || []).some(
        (o) => o.outcome_type === outcomeType && isValidOutcome(o, outcomeType)
      );
    });
  }

  return available;
}

/**
 * Filter trials based on filter criteria
 */
export function filterTrials(trials, filters) {
  const {
    cancerTypeFilters,
    biomarkerFilters,
    phaseFilters,
    statusFilter,
    lineOfTherapyFilter,
    nctIdFilters,
    sponsorFilters,
    drugFilters,
    treatmentClassFilters,
    cancerStageFilter,
    priorTkiFilter,
    priorIoFilter,
    priorPlatinumFilter,
  } = filters;

  return trials.filter((trial) => {
    // NCT ID filter (OR logic)
    if (nctIdFilters.length > 0) {
      const matches = nctIdFilters.some((id) => trial.nct_id?.toUpperCase() === id.toUpperCase());
      if (!matches) return false;
    }

    // Sponsor filter (OR logic)
    if (sponsorFilters?.length > 0) {
      const matches = sponsorFilters.some((s) => trial.sponsor === s);
      if (!matches) return false;
    }

    // Drug filter (OR logic - trial must contain at least one selected drug)
    if (drugFilters?.length > 0) {
      const trialDrugs = Object.values(trial.arm_drugs || {}).flatMap((drugs) =>
        Array.isArray(drugs) ? drugs : [drugs]
      );
      const matches = drugFilters.some((drug) =>
        trialDrugs.some((trialDrug) =>
          trialDrug?.toLowerCase().includes(drug.toLowerCase())
        )
      );
      if (!matches) return false;
    }

    // Cancer Type filter (OR logic - union of selected types)
    if (cancerTypeFilters.length > 0) {
      const hasMatch = cancerTypeFilters.some((ct) => (trial.cancer_types || []).includes(ct));
      if (!hasMatch) return false;
    }

    // Cancer Stage filter
    if (cancerStageFilter) {
      const hasMatch = (trial.cancer_stages || []).includes(cancerStageFilter);
      if (!hasMatch) return false;
    }

    if (biomarkerFilters.length > 0) {
      if (!trialMatchesBiomarkerFilter(trial, biomarkerFilters)) {
        return false;
      }
    }

    // Phase filter (OR logic - any of selected phases)
    if (phaseFilters.length > 0) {
      if (!phaseFilters.includes(trial.phase)) return false;
    }

    if (statusFilter && trial.status !== statusFilter) {
      return false;
    }

    if (lineOfTherapyFilter && trial.line_of_therapy !== lineOfTherapyFilter) {
      return false;
    }

    // Treatment Class filter (OR logic - union of selected classes)
    if (treatmentClassFilters.length > 0) {
      const trialClasses = Object.values(trial.treatment_class_map || {});
      const hasMatch = treatmentClassFilters.some((tc) => trialClasses.includes(tc));
      if (!hasMatch) return false;
    }

    // Eligibility criteria filters
    if (priorTkiFilter && trial.prior_tki !== true) return false;
    if (priorIoFilter && trial.prior_io !== true) return false;
    if (priorPlatinumFilter && trial.prior_platinum !== true) return false;

    return true;
  });
}
