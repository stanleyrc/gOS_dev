import {
  TierBadgeRenderer,
  FormattedNumberRenderer,
  StringRenderer,
  EventDetailRenderer,
  LocationRenderer,
  ClassIconRenderer,
  ClinvarIconRenderer,
  GnomadAfRenderer,
} from "./columnRenderers";

/**
 * filteredEventsColumnRegistry
 * 
 * Maps viewType identifiers to their corresponding renderer components.
 * This registry allows renderers to be added/modified without changing the component logic.
 * 
 * Usage:
 *   const RendererComponent = filteredEventsColumnRegistry[columnDef.viewType];
 *   if (RendererComponent) {
 *     return <RendererComponent value={value} record={record} {...props} />;
 *   }
 */
export const filteredEventsColumnRegistry = {
  "gene-link": EventDetailRenderer,
  "event-detail-link": EventDetailRenderer,
  "tier-badge": TierBadgeRenderer,
  "formatted-number": FormattedNumberRenderer,
  "string-basic": StringRenderer,
  "location-link": LocationRenderer,
  "class-icon": ClassIconRenderer,
  "clinvar-icon": ClinvarIconRenderer,
  "gnomad-af-link": GnomadAfRenderer,
};

const filteredEventsColumnIdRegistry = {
  clinvar: ClinvarIconRenderer,
  gnomad_af: GnomadAfRenderer,
};

/**
 * Get a renderer for a column definition. Semantic annotation IDs override
 * legacy view types so externally supplied dataset configurations gain their
 * expected links without requiring a synchronized configuration update.
 */
export function getColumnRenderer(viewType, columnId) {
  return (
    filteredEventsColumnIdRegistry[columnId] ||
    filteredEventsColumnRegistry[viewType] ||
    StringRenderer
  );
}
