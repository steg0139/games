import { describe, expect, it } from "vitest";
import { formatClock } from "./useGameTimer";

describe("formatClock", () => {
  it("formats sub-minute as m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(59)).toBe("0:59");
  });

  it("formats minutes as m:ss", () => {
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(61)).toBe("1:01");
    expect(formatClock(125)).toBe("2:05");
    expect(formatClock(599)).toBe("9:59");
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(3599)).toBe("59:59");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
    expect(formatClock(7325)).toBe("2:02:05");
  });

  it("floors fractional seconds and clamps negatives", () => {
    expect(formatClock(5.9)).toBe("0:05");
    expect(formatClock(-10)).toBe("0:00");
  });
});
