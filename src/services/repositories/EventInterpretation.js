/**
 * EventInterpretation data model.
 * Represents user edits and overrides for a specific genomic event in a case.
 */

export class EventInterpretation {
  constructor({
    caseId,
    alterationId,
    tier = null,
    gene_summary = null,
    variant_summary = null,
    effect_description = null,
    notes = null,
    therapeutics = null,
    resistances = null,
    metadata = {},
  } = {}) {
    this.caseId = String(caseId || "");
    this.alterationId = String(alterationId || "");
    this.tier = tier != null ? String(tier) : null;
    this.gene_summary = gene_summary != null ? String(gene_summary) : null;
    this.variant_summary = variant_summary != null ? String(variant_summary) : null;
    this.effect_description = effect_description != null ? String(effect_description) : null;
    this.notes = notes != null ? String(notes) : null;
    this.therapeutics = this._normalizeList(therapeutics);
    this.resistances = this._normalizeList(resistances);
    this.metadata = { ...metadata };
  }

  _normalizeList(value) {
    if (value == null) return null;
    if (Array.isArray(value)) {
      return value.filter(Boolean).map(String);
    }
    return String(value)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get id() {
    return `${this.caseId}::${this.alterationId}`;
  }

  toJSON() {
    return {
      caseId: this.caseId,
      alterationId: this.alterationId,
      tier: this.tier,
      gene_summary: this.gene_summary,
      variant_summary: this.variant_summary,
      effect_description: this.effect_description,
      notes: this.notes,
      therapeutics: this.therapeutics,
      resistances: this.resistances,
      metadata: this.metadata,
    };
  }

  static fromJSON(data) {
    return new EventInterpretation(data);
  }

  static createId(caseId, alterationId) {
    return `${String(caseId || "")}::${String(alterationId || "")}`;
  }

  hasOverrides() {
    return (
      this.tier != null ||
      this.gene_summary != null ||
      this.variant_summary != null ||
      this.effect_description != null ||
      this.notes != null ||
      (this.therapeutics != null && this.therapeutics.length > 0) ||
      (this.resistances != null && this.resistances.length > 0)
    );
  }

  merge(updates) {
    return new EventInterpretation({
      ...this.toJSON(),
      ...updates,
    });
  }
}
