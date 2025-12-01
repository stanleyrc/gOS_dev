import {
  TierBadgeRenderer,
  FormattedNumberRenderer,
  StringRenderer,
  GeneRenderer,
  LocationRenderer,
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
  "gene-link": GeneRenderer,
  "tier-badge": TierBadgeRenderer,
  "formatted-number": FormattedNumberRenderer,
  "string-basic": StringRenderer,
  "location-link": LocationRenderer,
};

/**
 * Get a renderer for a column definition
 * Falls back to StringRenderer if viewType not found
 */
export function getColumnRenderer(viewType) {
  return filteredEventsColumnRegistry[viewType] || StringRenderer;
}
