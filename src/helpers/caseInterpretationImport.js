import EventInterpretation from "./EventInterpretation";
import {
  CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID,
  CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID,
  createExactEventKey,
} from "./interpretationHistory";

const currentSourceContract = {
  directory: "retier_trace",
  userTierPrefix: "retier_agg_user_tier_",
  tierPrefix: "retier_agg_tier_",
};

const commonRequiredColumns = [
  "onco_vkey",
  "onco_vkey_kind",
  "onco_fusion_genes",
  "gene",
  "hgvsc",
  "tier",
  "freq",
];

function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeChromosome(value) {
  return normalize(value).replace(/^chr/i, "");
}

function parseSourceVcfKey(value) {
  const parts = normalize(value).split(/\s+/);
  if (parts.length !== 4) return null;
  return {
    chromosome: normalizeChromosome(parts[0]),
    position: parts[1],
    reference: parts[2],
    alternate: parts[3],
  };
}

function parseEventVcfKey(value) {
  const match = /^([^:]+):(\d+)-(\d+)\s+([^>\s]+)>(\S+)$/.exec(
    normalize(value),
  );
  if (!match) return null;
  return {
    chromosome: normalizeChromosome(match[1]),
    position: match[2],
    end: match[3],
    reference: match[4],
    alternate: match[5],
  };
}

function rowMatchesEvent(row, event) {
  const sourceGene = normalize(row.gene);
  const eventGene = normalize(event.gene);
  if (sourceGene !== eventGene) return false;

  const hgvsc = normalize(row.hgvsc);
  const eventVariants = normalize(event.variant ?? event.Variant)
    .split("/")
    .map((part) => part.trim());
  if (!eventVariants.includes(hgvsc)) return false;

  const sourceKey = parseSourceVcfKey(row.onco_vkey);
  const eventKey = parseEventVcfKey(event.Variant_g);
  return Boolean(
    sourceKey &&
      eventKey &&
      sourceKey.chromosome === eventKey.chromosome &&
      sourceKey.position === eventKey.position &&
      sourceKey.reference === eventKey.reference &&
      sourceKey.alternate === eventKey.alternate,
  );
}

function eventReference(event) {
  return {
    alterationId: event.uid,
    gene: event.gene,
    variant: event.variant ?? event.Variant ?? null,
    variantType: event.type,
  };
}

function parseTsv(text) {
  const table = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === "\t") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      table.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("TSV contains an unterminated quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    table.push(row);
  }
  if (table.length === 0) return { columns: [], records: [] };

  const columns = table[0];
  const records = table.slice(1).map((values) =>
    columns.reduce((record, column, index) => {
      record[column] = values[index] ?? "";
      return record;
    }, {}),
  );
  return { columns, records };
}

function parseRows(text, requiredColumns, label) {
  if (typeof text !== "string") {
    throw new Error(`${label} must be TSV text`);
  }

  const parsed = parseTsv(text);
  const missingColumns = requiredColumns.filter(
    (column) => !parsed.columns.includes(column),
  );
  if (missingColumns.length > 0) {
    throw new Error(`${label} is missing columns: ${missingColumns.join(", ")}`);
  }
  return parsed.records;
}

function parseTierAndFrequency(row, label) {
  const tier = Number(row.tier);
  const frequency = Number(row.freq);
  if (![1, 2, 3].includes(tier)) {
    throw new Error(`${label} has invalid tier ${row.tier}`);
  }
  if (!Number.isInteger(frequency) || frequency <= 0) {
    throw new Error(`${label} has invalid frequency ${row.freq}`);
  }
  return { tier, frequency };
}

function resolveEvent(row, events, label) {
  if (!normalize(row.gene)) {
    throw new Error(`${label} has missing gene`);
  }
  if (!normalize(row.hgvsc)) {
    throw new Error(`${label} has missing hgvsc`);
  }
  const keyKind = normalize(row.onco_vkey_kind);
  if (keyKind !== "vcf_coord") {
    throw new Error(`${label} has Unsupported event key kind ${keyKind || "empty"}`);
  }
  const matches = (events || []).filter((event) => rowMatchesEvent(row, event));
  if (matches.length !== 1) {
    throw new Error(`${label} must match exactly one event; matched ${matches.length}`);
  }
  if (!createExactEventKey(matches[0])) {
    throw new Error(`${label} matched an event without an exact event key`);
  }
  return matches[0];
}

function aggregateKey(event, tier) {
  return `${createExactEventKey(event)}::tier-${tier}`;
}

function sourceUser(row) {
  const sourceId = normalize(row.user);
  return sourceId
    ? { kind: "identified", sourceId, displayName: sourceId }
    : { kind: "unattributed", sourceId: "unattributed", displayName: "Unattributed" };
}

function importedAuthorId(aggregateId) {
  return `case-interpretation-import::${encodeURIComponent(aggregateId)}`;
}

export function createCaseInterpretationImportUrls({
  dataPath,
  caseId,
  sourceStem,
}) {
  const stem = sourceStem || caseId;
  const base = `${dataPath}${caseId}/${currentSourceContract.directory}/`;
  return {
    userTier: `${base}${currentSourceContract.userTierPrefix}${stem}.tsv`,
    tier: `${base}${currentSourceContract.tierPrefix}${stem}.tsv`,
  };
}

export function parseCaseInterpretationImport({
  userTierText,
  tierText,
  events,
  datasetId,
  caseId,
}) {
  try {
    const userRows = parseRows(
      userTierText,
      [...commonRequiredColumns, "user"],
      "User/tier aggregate",
    );
    const tierRows = parseRows(
      tierText,
      commonRequiredColumns,
      "Tier aggregate",
    );

    const seenInterpretations = new Set();
    const userSums = new Map();
    const interpretations = userRows.map((row, index) => {
      const label = `User/tier row ${index + 1}`;
      const event = resolveEvent(row, events, label);
      const { tier, frequency } = parseTierAndFrequency(row, label);
      const user = sourceUser(row);
      const eventKey = createExactEventKey(event);
      if (!eventKey) {
        throw new Error(`${label} matched an event without complete exact identity`);
      }
      const identityKey = `${eventKey}::${user.kind}:${user.sourceId}::tier-${tier}`;
      if (seenInterpretations.has(identityKey)) {
        throw new Error(`${label} duplicates aggregate identity ${identityKey}`);
      }
      seenInterpretations.add(identityKey);

      const tierKey = aggregateKey(event, tier);
      userSums.set(tierKey, (userSums.get(tierKey) || 0) + frequency);
      const aggregateId = JSON.stringify([
        eventKey,
        user.kind,
        user.sourceId,
        tier,
      ]);

      return new EventInterpretation({
        datasetId: CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID,
        caseId: CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID,
        alterationId: event.uid,
        gene: event.gene,
        variant: event.variant ?? event.Variant ?? null,
        variant_type: event.type,
        authorId: importedAuthorId(aggregateId),
        authorName: user.displayName,
        lastModified: null,
        data: { tier: String(tier) },
        frequency,
        source: {
          kind: "case-interpretation-import",
          aggregateId,
          caseId,
          datasetId,
        },
      }).toJSON();
    });

    const tierFrequencies = new Map();
    const distributionsByEvent = new Map();
    tierRows.forEach((row, index) => {
      const label = `Tier row ${index + 1}`;
      const event = resolveEvent(row, events, label);
      const { tier, frequency } = parseTierAndFrequency(row, label);
      const tierKey = aggregateKey(event, tier);
      if (tierFrequencies.has(tierKey)) {
        throw new Error(`${label} duplicates aggregate identity ${tierKey}`);
      }
      tierFrequencies.set(tierKey, frequency);

      const eventKey = createExactEventKey(event);
      if (!eventKey) {
        throw new Error(`${label} matched an event without complete exact identity`);
      }
      if (!distributionsByEvent.has(eventKey)) {
        distributionsByEvent.set(eventKey, {
          event: eventReference(event),
          counts: { 1: 0, 2: 0, 3: 0 },
        });
      }
      distributionsByEvent.get(eventKey).counts[tier] = frequency;
    });

    const allTierKeys = new Set([
      ...userSums.keys(),
      ...tierFrequencies.keys(),
    ]);
    allTierKeys.forEach((key) => {
      const userFrequency = userSums.get(key);
      const tierFrequency = tierFrequencies.get(key);
      if (userFrequency !== tierFrequency) {
        throw new Error(
          `${key} user frequency ${userFrequency ?? 0} does not match tier frequency ${tierFrequency ?? 0}`,
        );
      }
    });

    return {
      state: "ready",
      interpretations,
      distributions: Array.from(distributionsByEvent.values()),
    };
  } catch (error) {
    return {
      state: "rejected",
      issues: [error.message || "Invalid case interpretation import"],
    };
  }
}
