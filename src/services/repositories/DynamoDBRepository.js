/**
 * AWS DynamoDB implementation of EventInterpretationRepository.
 * Handles cloud-based persistent storage for event interpretations.
 */

import { EventInterpretationRepository } from "./EventInterpretationRepository";
import EventInterpretation from "../../helpers/EventInterpretation";
import { getUser } from "../../helpers/userAuth";
import { verifyOwnInterpretation } from "../signatures/SignatureService";
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  DeleteItemCommand,
  BatchWriteItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const TABLE_NAME = process.env.REACT_APP_GOS_DYNAMODB_TABLE_NAME || "gos_report_auditing_hmf_test";
const AWS_REGION = process.env.REACT_APP_GOS_AWS_REGION || "us-east-1";

export class DynamoDBRepository extends EventInterpretationRepository {
  constructor(config = {}) {
    super();
    this.tableName = config.tableName || TABLE_NAME;
    
    const clientConfig = {
      region: config.region || AWS_REGION,
      ...config.clientConfig,
    };

    // Add credentials from environment variables if available
    if (process.env.REACT_APP_GOS_AWS_ACCESS_KEY_ID && process.env.REACT_APP_GOS_AWS_SECRET_ACCESS_KEY) {
      clientConfig.credentials = {
        accessKeyId: process.env.REACT_APP_GOS_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.REACT_APP_GOS_AWS_SECRET_ACCESS_KEY,
      };
    }

    this.client = new DynamoDBClient(clientConfig);
  }

  /**
   * Create the composite sort key from alterationId and authorId
   */
  _createSortKey(alterationId, authorId) {
    return `${alterationId}::${authorId}`;
  }

  /**
   * Parse the composite sort key back to alterationId and authorId
   */
  _parseSortKey(sortKey) {
    const parts = sortKey.split("::");
    return {
      alterationId: parts[0],
      authorId: parts.slice(1).join("::"), // Handle authorId containing "::"
    };
  }

  /**
   * Convert EventInterpretation to DynamoDB item format
   */
  _toDynamoDBItem(interpretation) {
    const json = interpretation.toJSON ? interpretation.toJSON() : interpretation;
    const item = {
      datasetIdCaseId: `${json.datasetId}::${json.caseId}`, // NEW: Composite partition key
      alterationIdAuthorId: this._createSortKey(json.alterationId, json.authorId),
      // Keep old fields for backwards compatibility during migration
      caseId: json.caseId,
      datasetId: json.datasetId, // NEW
      ...json,
      updatedAt: Date.now(),
    };
    
    // Convert hasTierChange to string for GSI (DynamoDB GSI sort keys are String type)
    if (item.hasTierChange !== undefined && item.hasTierChange !== null) {
      item.hasTierChange = String(item.hasTierChange);
    }

    // Remove undefined values as DynamoDB doesn't allow them
    Object.keys(item).forEach(key => {
      if (item[key] === undefined) {
        delete item[key];
      }
    });

    return item;
  }

  /**
   * Convert DynamoDB item to EventInterpretation
   */
  _fromDynamoDBItem(item) {
    const data = unmarshall(item);
    const { alterationId, authorId } = this._parseSortKey(data.alterationIdAuthorId);

    return new EventInterpretation({
      ...data,
      alterationId,
      authorId,
      signature: data.signature || null,
    });
  }

  async save(interpretation) {
    if (!(interpretation instanceof EventInterpretation)) {
      interpretation = new EventInterpretation(interpretation);
    }

    if (!interpretation.caseId || !interpretation.alterationId) {
      throw new Error("EventInterpretation must have caseId and alterationId");
    }

    // Verify signature if present (defense in depth)
    if (interpretation.signature) {
      const interpretationData = interpretation.toJSON();
      const { signature, ...dataWithoutSignature } = interpretationData;
      const isValid = await verifyOwnInterpretation(dataWithoutSignature, signature);
      
      if (!isValid) {
        console.warn('Signature verification failed for interpretation - proceeding anyway (client-side check)');
      }
    }

    const item = this._toDynamoDBItem(interpretation);

    try {
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
      });

      await this.client.send(command);
      return interpretation;
    } catch (error) {
      console.error("Failed to save interpretation:", error);
      throw new Error(`DynamoDB save failed: ${error.message}`);
    }
  }

  async get(datasetId, caseId, alterationId, authorId) {
    const sortKey = this._createSortKey(alterationId, authorId);

    try {
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          datasetIdCaseId: `${datasetId}::${caseId}`,
          alterationIdAuthorId: sortKey,
        }),
      });

      const response = await this.client.send(command);

      if (!response.Item) {
        return null;
      }

      return this._fromDynamoDBItem(response.Item);
    } catch (error) {
      console.error("Failed to get interpretation:", error);
      return null;
    }
  }

  async getForCase(datasetId, caseId) {
    if (!datasetId || !caseId) return [];

    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "datasetIdCaseId = :datasetIdCaseId",
        ExpressionAttributeValues: marshall({
          ":datasetIdCaseId": `${datasetId}::${caseId}`,
        }),
      });

      const response = await this.client.send(command);
      const items = response.Items || [];

      return items.map(item => this._fromDynamoDBItem(item));
    } catch (error) {
      console.error("Failed to get interpretations for case:", error);
      return [];
    }
  }

  async delete(datasetId, caseId, alterationId, authorId) {
    const sortKey = this._createSortKey(alterationId, authorId);

    try {
      const command = new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({
          datasetIdCaseId: `${datasetId}::${caseId}`,
          alterationIdAuthorId: sortKey,
        }),
      });

      await this.client.send(command);
    } catch (error) {
      console.error("Failed to delete interpretation:", error);
      throw error;
    }
  }

  async clearCase(datasetId, caseId) {
    if (!datasetId || !caseId) return;

    try {
      // First get all items for this case
      const interpretations = await this.getForCase(datasetId, caseId);

      if (interpretations.length === 0) return;

      // Delete in batches of 25 (DynamoDB limit)
      const batches = [];
      for (let i = 0; i < interpretations.length; i += 25) {
        batches.push(interpretations.slice(i, i + 25));
      }

      for (const batch of batches) {
        const deleteRequests = batch.map(interpretation => ({
          DeleteRequest: {
            Key: marshall({
              datasetIdCaseId: `${interpretation.datasetId}::${interpretation.caseId}`,
              alterationIdAuthorId: this._createSortKey(
                interpretation.alterationId,
                interpretation.authorId
              ),
            }),
          },
        }));

        const command = new BatchWriteItemCommand({
          RequestItems: {
            [this.tableName]: deleteRequests,
          },
        });

        await this.client.send(command);
      }
    } catch (error) {
      console.error("Failed to clear case:", error);
      throw error;
    }
  }

  async bulkSave(interpretations) {
    if (!Array.isArray(interpretations) || interpretations.length === 0) {
      return [];
    }

    const normalized = interpretations.map((interp) =>
      interp instanceof EventInterpretation
        ? interp
        : new EventInterpretation(interp)
    );

    try {
      // Process in batches of 25 (DynamoDB limit)
      const batches = [];
      for (let i = 0; i < normalized.length; i += 25) {
        batches.push(normalized.slice(i, i + 25));
      }

      for (const batch of batches) {
        const putRequests = batch.map(interpretation => ({
          PutRequest: {
            Item: marshall(this._toDynamoDBItem(interpretation), {
              removeUndefinedValues: true,
            }),
          },
        }));

        const command = new BatchWriteItemCommand({
          RequestItems: {
            [this.tableName]: putRequests,
          },
        });

        await this.client.send(command);
      }

      return normalized;
    } catch (error) {
      console.error("Failed to bulk save interpretations:", error);
      throw new Error(`DynamoDB bulk save failed: ${error.message}`);
    }
  }

  async saveGlobalNotes(datasetId, caseId, notes) {
  if (!datasetId || !caseId) return;

  const interpretation = new EventInterpretation({
  datasetId,
  caseId,
  alterationId: "GLOBAL_NOTES",
    data: { notes: String(notes || "") }
    });

    return this.save(interpretation);
  }

  async getAll() {
    try {
      const command = new ScanCommand({
        TableName: this.tableName,
      });

      const response = await this.client.send(command);
      const items = response.Items || [];

      return items.map(item => this._fromDynamoDBItem(item));
    } catch (error) {
      console.error("Failed to get all interpretations:", error);
      return [];
    }
  }

  async getGlobalNotes(datasetId, caseId) {
  if (!datasetId || !caseId) return null;

  const user = getUser();
  if (!user) return null;

  const interpretation = await this.get(datasetId, caseId, "GLOBAL_NOTES", user.userId);
  return interpretation?.data?.notes ?? null;
  }

  async getCasesWithInterpretations(datasetId) {
    if (!datasetId) {
      return {
        withTierChange: new Set(),
        byAuthor: new Map(),
        byGene: new Map(),
        all: new Set(),
      };
    }

    try {
      // Query 1: Get cases WITH tier changes using GSI
      const withTierChangeCommand = new QueryCommand({
        TableName: this.tableName,
        IndexName: "datasetId-hasTierChange-index",
        KeyConditionExpression: "datasetId = :datasetId AND hasTierChange = :hasTierChange",
        ExpressionAttributeValues: marshall({
          ":datasetId": datasetId,
          ":hasTierChange": "true", // String type in DynamoDB GSI
        }),
        ProjectionExpression: "datasetIdCaseId",
      });

      // Query 2: Get all interpretations grouped by author using GSI
      const byAuthorCommand = new QueryCommand({
        TableName: this.tableName,
        IndexName: "datasetId-authorName-index",
        KeyConditionExpression: "datasetId = :datasetId",
        ExpressionAttributeValues: marshall({
          ":datasetId": datasetId,
        }),
        ProjectionExpression: "datasetIdCaseId, authorName",
      });

      // Query 3: Get all interpretations grouped by gene using GSI
      const byGeneCommand = new QueryCommand({
        TableName: this.tableName,
        IndexName: "datasetId-gene-index",
        KeyConditionExpression: "datasetId = :datasetId",
        ExpressionAttributeValues: marshall({
          ":datasetId": datasetId,
        }),
        ProjectionExpression: "datasetIdCaseId, gene",
      });

      // Execute all queries in parallel
      const [withTierChangeResponse, byAuthorResponse, byGeneResponse] = await Promise.all([
        this.client.send(withTierChangeCommand),
        this.client.send(byAuthorCommand),
        this.client.send(byGeneCommand),
      ]);

      const withTierChangeItems = withTierChangeResponse.Items || [];
      const byAuthorItems = byAuthorResponse.Items || [];
      const byGeneItems = byGeneResponse.Items || [];

      // Extract cases with tier changes
      const withTierChange = new Set();
      withTierChangeItems.forEach(item => {
        const datasetIdCaseId = unmarshall(item).datasetIdCaseId;
        const caseId = datasetIdCaseId.split("::").slice(1).join("::");
        withTierChange.add(caseId);
      });

      // Group cases by author
      const byAuthor = new Map();
      const allCases = new Set();
      byAuthorItems.forEach(item => {
        const data = unmarshall(item);
        const datasetIdCaseId = data.datasetIdCaseId;
        const caseId = datasetIdCaseId.split("::").slice(1).join("::");
        const authorName = data.authorName;
        
        allCases.add(caseId);
        
        if (authorName) {
          if (!byAuthor.has(authorName)) {
            byAuthor.set(authorName, new Set());
          }
          byAuthor.get(authorName).add(caseId);
        }
      });

      // Group cases by gene
      const byGene = new Map();
      byGeneItems.forEach(item => {
        const data = unmarshall(item);
        const datasetIdCaseId = data.datasetIdCaseId;
        const caseId = datasetIdCaseId.split("::").slice(1).join("::");
        const gene = data.gene;
        
        if (gene) {
          if (!byGene.has(gene)) {
            byGene.set(gene, new Set());
          }
          byGene.get(gene).add(caseId);
        }
      });

      return {
        withTierChange,
        byAuthor,
        byGene,
        all: allCases,
      };
    } catch (error) {
      console.error("Failed to get cases with interpretations:", error);
      return {
        withTierChange: new Set(),
        byAuthor: new Map(),
        byGene: new Map(),
        all: new Set(),
      };
    }
  }

  async getCasesInterpretationsCount(datasetId) {
  return this._getCasesData(datasetId, "count"); // "count" for Map mode
  }

  async _getCasesData(datasetId, returnType) {
    if (!datasetId) return returnType === "set" ? new Set() : new Map();

    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: "datasetId-datasetIdCaseId-index",
        KeyConditionExpression: "datasetId = :datasetId",
        ExpressionAttributeValues: marshall({
          ":datasetId": datasetId,
        }),
        ProjectionExpression: "datasetIdCaseId",
      });

      const response = await this.client.send(command);
      const items = response.Items || [];

      if (returnType === "set") {
        // Extract unique caseIds from composite keys
        const caseIds = new Set();
        items.forEach(item => {
          const datasetIdCaseId = unmarshall(item).datasetIdCaseId;
          const caseId = datasetIdCaseId.split("::").slice(1).join("::");
          caseIds.add(caseId);
        });
        return caseIds;
      } else {
        // Count interpretations per case
        const countMap = new Map();
        items.forEach(item => {
          const datasetIdCaseId = unmarshall(item).datasetIdCaseId;
          const caseId = datasetIdCaseId.split("::").slice(1).join("::");
          countMap.set(caseId, (countMap.get(caseId) || 0) + 1);
        });
        return countMap;
      }
    } catch (error) {
      console.error("Failed to get cases data:", error);
      return returnType === "set" ? new Set() : new Map();
    }
  }

  async getTierCountsByGeneVariantType(gene, variantType) {
    if (!gene || !variantType) {
      return { 1: 0, 2: 0, 3: 0 };
    }

    try {
      const counts = { 1: 0, 2: 0, 3: 0 };
      let lastEvaluatedKey = undefined;

      do {
        const command = new QueryCommand({
          TableName: this.tableName,
          IndexName: "gene-variant_type-index",
          KeyConditionExpression: "gene = :gene AND variant_type = :variantType",
          ExpressionAttributeValues: marshall({
            ":gene": gene,
            ":variantType": variantType,
          }),
          ProjectionExpression: "data.tier",
          ExclusiveStartKey: lastEvaluatedKey,
        });

        const response = await this.client.send(command);
        const items = response.Items || [];

        items.forEach(item => {
          const data = unmarshall(item);
          const tier = Number(data.data?.tier);
          if ([1, 2, 3].includes(tier)) {
            counts[tier]++;
          }
        });

        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return counts;
    } catch (error) {
      console.error("Failed to get tier counts:", error);
      return { 1: 0, 2: 0, 3: 0 };
    }
  }
}
