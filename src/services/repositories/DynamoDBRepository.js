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
      caseId: json.caseId,
      alterationIdAuthorId: this._createSortKey(json.alterationId, json.authorId),
      caseId_alterationId: `${json.caseId}::${json.alterationId}`, // For GSI if needed
      ...json,
      updatedAt: Date.now(),
    };

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

  async get(caseId, alterationId, authorId) {
    const sortKey = this._createSortKey(alterationId, authorId);

    try {
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          caseId,
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

  async getForCase(caseId) {
    if (!caseId) return [];

    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "caseId = :caseId",
        ExpressionAttributeValues: marshall({
          ":caseId": caseId,
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

  async delete(caseId, alterationId, authorId) {
    const sortKey = this._createSortKey(alterationId, authorId);

    try {
      const command = new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({
          caseId,
          alterationIdAuthorId: sortKey,
        }),
      });

      await this.client.send(command);
    } catch (error) {
      console.error("Failed to delete interpretation:", error);
      throw error;
    }
  }

  async clearCase(caseId) {
    if (!caseId) return;

    try {
      // First get all items for this case
      const interpretations = await this.getForCase(caseId);

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
              caseId: interpretation.caseId,
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

  async saveGlobalNotes(caseId, notes) {
    if (!caseId) return;

    const interpretation = new EventInterpretation({
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

  async getGlobalNotes(caseId) {
    if (!caseId) return null;

    const user = getUser();
    if (!user) return null;

    const interpretation = await this.get(caseId, "GLOBAL_NOTES", user.userId);
    return interpretation?.data?.notes ?? null;
  }
}
