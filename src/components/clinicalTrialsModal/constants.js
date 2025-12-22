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

export const OUTCOME_TYPES = ['PFS', 'OS', 'ORR'];
