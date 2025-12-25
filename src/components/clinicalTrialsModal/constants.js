export const TREATMENT_COLORS = {
  'TKI': '#FF6B6B',
  'IO': '#4ECDC4',
  'Chemo': '#45B7D1',
  'ADC': '#FFA07A',
  'Combo_TKI_IO': '#1ABC9C',
  'Combo_TKI_Chemo': '#E67E22',
  'Combo_TKI_Targeted': '#D35400',
  'Combo_Chemo_IO': '#9B59B6',
  'Combo_Chemo_Targeted': '#16A085',
  'Combo_IO_Targeted': '#8E44AD',
  'Targeted_Other': '#F39C12',
  'Placebo': '#BDC3C7',
  'OTHER': '#7F8C8D'
};

export const SOC_CLASSES = ['Chemo', 'Placebo'];

export const PHASE_OPTIONS = [
  { label: 'Phase 1', value: 'PHASE1' },
  { label: 'Phase 2', value: 'PHASE2' },
  { label: 'Phase 3', value: 'PHASE3' },
  { label: 'Phase 4', value: 'PHASE4' },
];

export const STATUS_OPTIONS = [
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Active (Not Recruiting)', value: 'ACTIVE_NOT_RECRUITING' },
];

export const LINE_OF_THERAPY_OPTIONS = [
  { label: '1L', value: '1L' },
  { label: '2L', value: '2L' },
  { label: '3L+', value: '3L+' },
  { label: 'Adjuvant', value: 'ADJUVANT' },
  { label: 'Neoadjuvant', value: 'NEOADJUVANT' },
  { label: 'Maintenance', value: 'MAINTENANCE' },
];

export const SOC_DISPLAY_MODE_OPTIONS = [
  { label: 'Hide', value: 'hide' },
  { label: 'Filtered', value: 'filtered' },
  { label: 'All', value: 'all' },
];

export const OUTCOME_TYPES = ['PFS', 'OS', 'ORR'];

// Plot configuration constants
export const PLOT_CONFIG = {
  HEIGHT: 550,
  MARGINS: { top: 20, right: 20, bottom: 40, left: 60 },
  CONTAINER_OFFSET: 220,
  MIN_WIDTH: 400,
  MIN_ZOOM_MONTHS: 1 / 12,
  Y_AXIS_PADDING: 1.15,
};

// Time conversion constants
export const TIME_CONVERSION = {
  DAYS_PER_MONTH: 30.44,
  WEEKS_PER_MONTH: 4.33,
  MONTHS_PER_YEAR: 12,
};

// Unit validation arrays
export const PERCENTAGE_UNITS = ["percent", "proportion", "participant", "patient", "probability", "rate", "%"];
export const TIME_UNITS = ["month", "day", "week", "year"];

// Default filter state factory
export const getDefaultFilterState = (includeCancerType = false, cancerType = "") => ({
  cancerTypeFilters: includeCancerType && cancerType ? [cancerType] : [],
  biomarkerInput: "",
  biomarkerFilters: [],
  phaseFilters: [],
  statusFilter: null,
  lineOfTherapyFilter: null,
  nctIdFilters: [],
  sponsorFilters: [],
  treatmentClassFilters: [],
  cancerStageFilter: null,
  priorTkiFilter: false,
  priorIoFilter: false,
  priorPlatinumFilter: false,
  socDisplayMode: 'hide',
});

// Biomarker parsing helper
export const parseBiomarkerFilter = (filterStr) => {
  if (!filterStr || !filterStr.trim()) return [];
  return filterStr
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .map((term) => {
      if (term.endsWith("+")) {
        return { target: term.slice(0, -1).toUpperCase(), status: "POSITIVE" };
      } else if (term.endsWith("-")) {
        return { target: term.slice(0, -1).toUpperCase(), status: "NEGATIVE" };
      } else {
        return { target: term.toUpperCase(), status: null };
      }
    });
};

// Generic options extractor
export const getUniqueOptionsFromTrials = (trials, extractorFn) => {
  const values = new Set();
  trials.forEach((trial) => extractorFn(trial, values));
  return Array.from(values)
    .sort()
    .map((v) => ({ label: v, value: v }));
};

// NCT ID options extractor
export const getNctIdOptionsFromTrials = (trials) => {
  return trials
    .filter((trial) => trial.nct_id)
    .map((trial) => ({ label: trial.nct_id, value: trial.nct_id }))
    .sort((a, b) => a.label.localeCompare(b.label));
};
