// Lambda handler for the profile API.
//   GET    /profile        -> this device's stored private profile (404 if none)
//   PUT    /profile        -> upsert this device's private profile
//   DELETE /profile        -> delete this device's private profile + public mirror
//   PUT    /public         -> publish this device's public profile (keyed by code)
//   GET    /public/{code}  -> read a public profile by friend code (no auth)
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
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SK_PROFILE = "PROFILE";
const SK_PUBLIC = "PUBLIC";

function pk(deviceId: string): string {
  return `DEVICE#${deviceId}`;
}

function codePk(code: string): string {
  return `CODE#${code}`;
}

/** Friend codes: 8 chars from our unambiguous alphabet, formatted XXXX-XXXX.
 *  Normalize + validate server-side so the stored key is canonical. Returns
 *  the canonical code or null if it doesn't match. */
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
function normalizeCode(raw: string): string | null {
  const up = raw.trim().toUpperCase().replace(/\s/g, "");
  if (!CODE_RE.test(up)) return null;
  const compact = up.replace("-", "");
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,DELETE,OPTIONS",
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

  const isPublic = rawPath.startsWith("/public");

  try {
    if (isPublic) {
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
