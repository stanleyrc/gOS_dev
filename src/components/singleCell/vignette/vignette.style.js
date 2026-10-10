import styled from "styled-components";

// Vignette chrome: neutral by default; colour only on the finding rank of
// major findings (accent) and on clone chips (their data colour).
const VignetteWrapper = styled.div`
  .sc-vignette-list {
    margin: 0 0 8px 0;
    padding-left: 22px;
  }
  .sc-vignette-finding {
    padding: 5px 0 6px;
    border-bottom: 1px solid var(--sc-border-soft, #f0f0f0);
  }
  .sc-vignette-finding::marker {
    color: var(--sc-muted, #666);
    font-weight: 600;
  }
  .sc-vignette-finding.major::marker {
    color: var(--sc-accent, #1677ff);
  }
  .sc-vignette-cat {
    display: inline-block;
    min-width: 64px;
    margin-right: 6px;
    font-size: var(--sc-fs-tick, 11.5px);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sc-evidence-chip {
    font-size: var(--sc-fs-tick, 11.5px);
    height: 22px;
    padding: 0 7px;
    color: var(--sc-text-secondary, #434343);
  }
  .sc-vignette-meta {
    display: flex;
    gap: 6px;
    align-items: baseline;
    margin-top: 6px;
  }
  .sc-vignette-metatag {
    flex: 0 0 auto;
    min-width: 62px;
    text-align: center;
    color: var(--sc-muted, #666);
    background: var(--sc-panel-alt, #fafafa);
  }
  .sc-vignette-metalabel {
    flex: 0 0 auto;
    min-width: 62px;
    font-size: var(--sc-fs-tick, 11.5px);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sc-vignette-cohort-row li.major::marker {
    color: var(--sc-accent, #1677ff);
  }
  .sc-vignette-cohort-row {
    padding: 8px 0 10px;
    border-bottom: 1px solid var(--sc-border, #d9d9d9);
  }
  .sc-vignette-cohort-row ol {
    margin: 4px 0 4px;
    padding-left: 20px;
  }
  .sc-vignette-cohort-row li {
    font-size: var(--sc-fs-label, 12.5px);
    line-height: 1.5;
  }
`;

export default VignetteWrapper;
