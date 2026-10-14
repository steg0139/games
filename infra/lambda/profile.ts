// Lambda handler for the profile API.
//   GET    /profile        -> this device's stored private profile (404 if none)
//   PUT    /profile        -> upsert this device's private profile
//   DELETE /profile        -> delete this device's private profile + public mirror
//   PUT    /public         -> publish this device's public profile (keyed by code)
//   GET    /public/{code}  -> read a public profile by friend code (no auth)
//   PUT    /daily          -> publish this device's daily result (first write wins)
//   POST   /daily/results  -> read daily results for a set of friend codes (no auth)
//
// Device is identified by the `x-device-id` request header for the private +
// write paths. The public read path needs no auth — anyone with a friend code
// can read the sanitized stats.
//
// Single-table design:
//   Private profile: PK = DEVICE#<id>,  SK = "PROFILE"
//   Public mirror:   PK = CODE#<code>,  SK = "PUBLIC"   (item carries ownerId)
// Keying the public mirror by code makes the read a direct point-get — no GSI.
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  SK_PROFILE,
  SK_PUBLIC,
  codePk,
  dailyPk,
  normalizeCode,
  pk,
  readDailyKey,
} from "./daily-key";

const TABLE_NAME = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
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
  // Route key is like "GET /public/{code}" for HTTP APIs; fall back to the
  // raw path for safety.
  const rawPath = event.requestContext?.http?.path ?? event.rawPath ?? "/profile";

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  try {
    if (rawPath.startsWith("/daily")) {
      return await handleDaily(event, method);
    }
    if (rawPath.startsWith("/public")) {
      return await handlePublic(event, method, rawPath);
    }
    return await handlePrivate(event, method);
  } catch (err) {
    console.error("profile handler error", err);
    return json(500, { message: "Internal error." });
  }
};

/** Private, device-keyed profile backup (full blob, last-writer-wins). */
async function handlePrivate(
  event: APIGatewayProxyEventV2,
  method: string,
): Promise<APIGatewayProxyResultV2> {
  const deviceId = readDeviceId(event);
  if (!deviceId) {
    return json(400, { message: "Missing or invalid x-device-id header." });
  }

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
    const profile = parseBody(event);
    if (profile === undefined) {
      return json(400, { message: "Body must be a JSON profile object." });
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

  if (method === "DELETE") {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk(deviceId), SK: SK_PROFILE },
      }),
    );
    return json(200, { ok: true });
  }

  return json(405, { message: `Method ${method} not allowed.` });
}

/** Public mirror keyed by friend code.
 *  PUT /public        (device-authenticated owner writes their mirror)
 *  GET /public/{code} (anyone reads the sanitized stats) */
async function handlePublic(
  event: APIGatewayProxyEventV2,
  method: string,
  rawPath: string,
): Promise<APIGatewayProxyResultV2> {
  if (method === "GET") {
    const raw = event.pathParameters?.code ?? rawPath.split("/")[2] ?? "";
    const code = normalizeCode(decodeURIComponent(raw));
    if (!code) return json(400, { message: "Invalid friend code." });

    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: codePk(code), SK: SK_PUBLIC },
      }),
    );
    if (!res.Item || !res.Item.public) {
      return json(404, { message: "No profile for that code." });
    }
    return json(200, res.Item.public);
  }

  if (method === "PUT") {
    const deviceId = readDeviceId(event);
    if (!deviceId) {
      return json(400, { message: "Missing or invalid x-device-id header." });
    }
    const body = parseBody(event) as { code?: unknown } | undefined;
    if (body === undefined) {
      return json(400, { message: "Body must be a JSON public-profile object." });
    }
    const code = typeof body.code === "string" ? normalizeCode(body.code) : null;
    if (!code) {
      return json(400, { message: "Public profile must include a valid code." });
    }

    // Ownership guard: a code is claimed by the first device to publish it.
    // A different device cannot overwrite someone else's public mirror.
    const existing = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: codePk(code), SK: SK_PUBLIC },
      }),
    );
    if (existing.Item && existing.Item.ownerId && existing.Item.ownerId !== deviceId) {
      return json(409, { message: "That friend code is already in use." });
    }

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: codePk(code),
          SK: SK_PUBLIC,
          ownerId: deviceId,
          public: { ...body, code },
          updatedAt: Date.now(),
        },
      }),
    );
    return json(200, { ok: true });
  }

  return json(405, { message: `Method ${method} not allowed.` });
}

/** Daily competition results.
 *  PUT  /daily          -> publish THIS device's result for a game/day/variant.
 *                          First write wins (locks the time; no replaying).
 *  POST /daily/results  -> read results for a set of friend codes on one board.
 *                          No auth: you only ever ask for codes you already hold. */
async function handleDaily(
  event: APIGatewayProxyEventV2,
  method: string,
): Promise<APIGatewayProxyResultV2> {
  if (method === "PUT") {
    const deviceId = readDeviceId(event);
    if (!deviceId) {
      return json(400, { message: "Missing or invalid x-device-id header." });
    }
    const body = parseBody(event);
    if (body === undefined) {
      return json(400, { message: "Body must be a JSON object." });
    }
    const key = readDailyKey(body);
    if (!key) {
      return json(400, { message: "Invalid game, day, or variant." });
    }
    const code =
      typeof body.code === "string" ? normalizeCode(body.code) : null;
    if (!code) {
      return json(400, { message: "A valid friend code is required." });
    }
    const timeSeconds =
      typeof body.timeSeconds === "number" &&
      Number.isFinite(body.timeSeconds) &&
      body.timeSeconds >= 0
        ? Math.floor(body.timeSeconds)
        : null;
    if (timeSeconds === null) {
      return json(400, { message: "A valid timeSeconds is required." });
    }
    const hints =
      typeof body.hints === "number" && Number.isFinite(body.hints) && body.hints >= 0
        ? Math.floor(body.hints)
        : 0;
    const displayName =
      typeof body.displayName === "string"
        ? body.displayName.slice(0, 24)
        : "";

    try {
      // First write wins: once your result for this board exists, it can't be
      // overwritten (so a replay or a second device can't change your time).
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: dailyPk(key.game, key.day, key.variant),
            SK: `CODE#${code}`,
            ownerId: deviceId,
            code,
            displayName,
            game: key.game,
            day: key.day,
            variant: key.variant,
            timeSeconds,
            hints,
            completedAt: Date.now(),
          },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
      return json(200, { ok: true });
    } catch (err) {
      // Conditional failure => already recorded; treat as success (idempotent).
      if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
        return json(200, { ok: true, alreadyRecorded: true });
      }
      throw err;
    }
  }

  if (method === "POST") {
    // /daily/results — batch read.
    const body = parseBody(event);
    if (body === undefined) {
      return json(400, { message: "Body must be a JSON object." });
    }
    const key = readDailyKey(body);
    if (!key) {
      return json(400, { message: "Invalid game, day, or variant." });
    }
    const rawCodes = Array.isArray(body.codes) ? body.codes : [];
    // Normalize, drop invalid, de-dupe, and cap the batch to a sane size.
    const codes = Array.from(
      new Set(
        rawCodes
          .filter((c): c is string => typeof c === "string")
          .map((c) => normalizeCode(c))
          .filter((c): c is string => c !== null),
      ),
    ).slice(0, 50);

    if (codes.length === 0) {
      return json(200, { results: [] });
    }

    const partition = dailyPk(key.game, key.day, key.variant);
    const res = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: codes.map((code) => ({ PK: partition, SK: `CODE#${code}` })),
          },
        },
      }),
    );
    const items = res.Responses?.[TABLE_NAME] ?? [];
    const results = items.map((it) => ({
      code: it.code,
      displayName: it.displayName ?? "",
      timeSeconds: it.timeSeconds,
      hints: it.hints ?? 0,
      completedAt: it.completedAt ?? 0,
    }));
    return json(200, { results });
  }

  return json(405, { message: `Method ${method} not allowed.` });
}

/** Parse and validate a JSON object body. Returns the parsed object, or
 *  undefined if missing/invalid. */
function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> | undefined {
  if (!event.body) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  return parsed as Record<string, unknown>;
}
