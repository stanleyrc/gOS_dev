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

// Color-by options for the legend dropdown
export const COLOR_BY_OPTIONS = [
  { label: 'Treatment Class', value: 'treatmentClass' },
  { label: 'Line of Therapy', value: 'line' },
  { label: 'Cancer Type', value: 'cancerType' },
  { label: 'Stage', value: 'stage' },
  { label: 'Status', value: 'status' },
];

export const LINE_OF_THERAPY_COLORS = {
  '1L': '#3498DB',
  '2L': '#E74C3C',
  '3L+': '#9B59B6',
  'ADJUVANT': '#27AE60',
  'NEOADJUVANT': '#F39C12',
  'MAINTENANCE': '#1ABC9C',
  'OTHER': '#7F8C8D',
};

export const STATUS_COLORS = {
  'COMPLETED': '#27AE60',
  'RECRUITING': '#3498DB',
  'ACTIVE_NOT_RECRUITING': '#F39C12',
  'TERMINATED': '#E74C3C',
  'WITHDRAWN': '#95A5A6',
  'SUSPENDED': '#D35400',
  'OTHER': '#7F8C8D',
};

export const CANCER_TYPE_COLORS = {
  'NSCLC': '#3498DB',
  'SCLC': '#E74C3C',
  'Breast': '#E91E63',
  'Colorectal': '#9B59B6',
  'Prostate': '#00BCD4',
  'Melanoma': '#795548',
  'Ovarian': '#FF9800',
  'Pancreatic': '#607D8B',
  'Bladder': '#4CAF50',
  'RCC': '#FF5722',
  'HCC': '#673AB7',
  'Gastric': '#009688',
  'OTHER': '#7F8C8D',
};

export const STAGE_COLORS = {
  'I': '#27AE60',
  'II': '#F39C12',
  'III': '#E67E22',
  'IIIA': '#E67E22',
  'IIIB': '#D35400',
  'IIIC': '#C0392B',
  'IV': '#E74C3C',
  'IVA': '#E74C3C',
  'IVB': '#C0392B',
  'Metastatic': '#8E44AD',
  'Locally Advanced': '#9B59B6',
  'OTHER': '#7F8C8D',
};

// Extended color palette for dynamic color generation
const EXTENDED_PALETTE = [
  '#3498DB', '#E74C3C', '#2ECC71', '#9B59B6', '#F39C12',
  '#1ABC9C', '#E91E63', '#00BCD4', '#FF5722', '#673AB7',
  '#4CAF50', '#FF9800', '#795548', '#607D8B', '#8BC34A',
  '#FFEB3B', '#03A9F4', '#CDDC39', '#009688', '#FFC107',
  '#5C6BC0', '#26A69A', '#EC407A', '#7E57C2', '#66BB6A',
  '#FFCA28', '#29B6F6', '#AB47BC', '#26C6DA', '#D4E157',
];

// Generate a consistent color for a string value using hash
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

// Cache for dynamically assigned colors
const dynamicColorCache = {};

/**
 * Get a color for a value, using the provided color map or generating one dynamically
 */
export const getColorForValue = (value, colorMap) => {
  if (colorMap[value]) {
    return colorMap[value];
  }

  // Check cache first
  if (dynamicColorCache[value]) {
    return dynamicColorCache[value];
  }

  // Generate a color based on hash
  const hash = hashString(value);
  const color = EXTENDED_PALETTE[hash % EXTENDED_PALETTE.length];
  dynamicColorCache[value] = color;
  return color;
};

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
