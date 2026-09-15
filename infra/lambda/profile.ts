// Lambda handler for the profile API.
//   GET  /profile   -> returns this device's stored profile (404 if none)
//   PUT  /profile   -> upserts this device's profile
// Device is identified by the `x-device-id` request header.
//
// Single-table design: PK = DEVICE#<id>, SK = "PROFILE".
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SK_PROFILE = "PROFILE";

function pk(deviceId: string): string {
  return `DEVICE#${deviceId}`;
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,OPTIONS",
  "access-control-allow-headers": "content-type,x-device-id",
  "access-control-max-age": "86400",
};

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

/** Basic validation: device id must look like a non-empty, sane token. */
function readDeviceId(event: APIGatewayProxyEventV2): string | null {
  const headers = event.headers ?? {};
  // API Gateway lowercases header keys for HTTP APIs.
  const raw = headers["x-device-id"];
  if (!raw) return null;
  const id = raw.trim();
  if (id.length === 0 || id.length > 128) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  return id;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method ?? "GET";

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const deviceId = readDeviceId(event);
  if (!deviceId) {
    return json(400, { message: "Missing or invalid x-device-id header." });
  }

  try {
    if (method === "GET") {
      const res = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk(deviceId), SK: SK_PROFILE },
        }),
      );
      if (!res.Item || !res.Item.profile) {
        return json(404, { message: "No profile for this device." });
      }
      return json(200, res.Item.profile);
    }

    if (method === "PUT") {
      if (!event.body) {
        return json(400, { message: "Request body required." });
      }
      let profile: unknown;
      try {
        profile = JSON.parse(event.body);
      } catch {
        return json(400, { message: "Body must be valid JSON." });
      }
      if (typeof profile !== "object" || profile === null) {
        return json(400, { message: "Body must be a profile object." });
      }

      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: pk(deviceId),
            SK: SK_PROFILE,
            profile,
            updatedAt: Date.now(),
          },
        }),
      );
      return json(200, { ok: true });
    }

    return json(405, { message: `Method ${method} not allowed.` });
  } catch (err) {
    console.error("profile handler error", err);
    return json(500, { message: "Internal error." });
  }
};
