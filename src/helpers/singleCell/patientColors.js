// Patient colours of the cohort views (d3-free so views without d3 can share them).
export const PATIENT_PALETTE = ["#4E79A7", "#A0CBE8", "#F28E2B", "#FFBE7D", "#59A14F", "#8CD17D", "#B6992D", "#F1CE63", "#499894", "#86BCB6"];
export const patientColor = (k) => PATIENT_PALETTE[k % PATIENT_PALETTE.length];
