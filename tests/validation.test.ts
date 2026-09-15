import {
  assertEnumValue,
  assertListLimit,
  assertListOffset,
  assertUuid,
} from "@/data/validation";

describe("data validation", () => {
  it("accepts UUIDs and rejects malformed identifiers", () => {
    expect(assertUuid("00000000-0000-4000-8000-000000000001", "id")).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(() => assertUuid("business-a", "businessId")).toThrow();
  });

  it("bounds list pagination", () => {
    expect(assertListLimit(undefined)).toBe(50);
    expect(assertListLimit(100)).toBe(100);
    expect(() => assertListLimit(101)).toThrow();
    expect(assertListOffset(0)).toBe(0);
    expect(() => assertListOffset(-1)).toThrow();
  });

  it("accepts only declared enum values", () => {
    expect(assertEnumValue("ready", ["draft", "ready"] as const, "status")).toBe(
      "ready",
    );
    expect(() =>
      assertEnumValue("processing", ["draft", "ready"] as const, "status"),
    ).toThrow();
  });
});
