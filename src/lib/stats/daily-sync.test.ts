import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force cloud sync on with a known base URL, and a stable device id, so the
// fetch plumbing actually runs (it short-circuits when sync is disabled).
vi.mock("../config", () => ({
  API_BASE_URL: "https://api.test",
  CLOUD_SYNC_ENABLED: true,
}));
vi.mock("../device", () => ({ getDeviceId: () => "device-xyz" }));

import {
  type DailyBoardKey,
  fetchDailyResults,
  postDailyResult,
} from "./daily-compete";

const board: DailyBoardKey = { game: "sudoku", day: 20012, variant: "easy" };

function mockFetch(
  impl: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(impl(String(input), init ?? {})),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postDailyResult", () => {
  it("PUTs to /daily with the device header and merged body", async () => {
    const fetchFn = mockFetch(() => new Response("{}", { status: 200 }));
    const ok = await postDailyResult(board, {
      code: "7XK9-2MH4",
      displayName: "Jo",
      timeSeconds: 123,
      hints: 2,
    });
    expect(ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/daily");
    expect(init?.method).toBe("PUT");
    expect((init?.headers as Record<string, string>)["x-device-id"]).toBe("device-xyz");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      game: "sudoku",
      day: 20012,
      variant: "easy",
      code: "7XK9-2MH4",
      timeSeconds: 123,
      hints: 2,
    });
  });

  it("returns false without a code (never hits the network)", async () => {
    const fetchFn = mockFetch(() => new Response("{}", { status: 200 }));
    const ok = await postDailyResult(board, {
      code: "",
      displayName: "Jo",
      timeSeconds: 1,
      hints: 0,
    });
    expect(ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns false on a non-ok response and swallows network errors", async () => {
    mockFetch(() => new Response("nope", { status: 500 }));
    expect(
      await postDailyResult(board, { code: "7XK9-2MH4", displayName: "", timeSeconds: 1, hints: 0 }),
    ).toBe(false);

    mockFetch(() => {
      throw new Error("network down");
    });
    expect(
      await postDailyResult(board, { code: "7XK9-2MH4", displayName: "", timeSeconds: 1, hints: 0 }),
    ).toBe(false);
  });
});

describe("fetchDailyResults", () => {
  it("POSTs the board + de-duped codes and returns the results array", async () => {
    const fetchFn = mockFetch(
      () =>
        new Response(
          JSON.stringify({ results: [{ code: "A", displayName: "A", timeSeconds: 10, hints: 0, completedAt: 1 }] }),
          { status: 200 },
        ),
    );
    const results = await fetchDailyResults(board, ["7XK9-2MH4", "7XK9-2MH4", "AAAA-BBBB"]);
    expect(results).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/daily/results");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.codes).toEqual(["7XK9-2MH4", "AAAA-BBBB"]); // de-duped
    expect(body).toMatchObject({ game: "sudoku", day: 20012, variant: "easy" });
  });

  it("short-circuits to [] with no codes (no network call)", async () => {
    const fetchFn = mockFetch(() => new Response("{}", { status: 200 }));
    expect(await fetchDailyResults(board, [])).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns null on a non-ok response, a bad shape, or a network error", async () => {
    mockFetch(() => new Response("nope", { status: 500 }));
    expect(await fetchDailyResults(board, ["AAAA-BBBB"])).toBeNull();

    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    expect(await fetchDailyResults(board, ["AAAA-BBBB"])).toBeNull();

    mockFetch(() => {
      throw new Error("offline");
    });
    expect(await fetchDailyResults(board, ["AAAA-BBBB"])).toBeNull();
  });
});
