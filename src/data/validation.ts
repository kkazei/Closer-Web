import { DataAccessError } from "./errors";
import type { JsonObject } from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, fieldName: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new DataAccessError(
      "INVALID_INPUT",
      `${fieldName} must be a valid UUID.`,
    );
  }

  return value;
}

export function assertOptionalUuid(
  value: string | null | undefined,
  fieldName: string,
): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  return assertUuid(value, fieldName);
}

export function assertNonBlank(value: string, fieldName: string): string {
  if (value.trim().length === 0) {
    throw new DataAccessError(
      "INVALID_INPUT",
      `${fieldName} must not be blank.`,
    );
  }

  return value;
}

export function assertDate(value: Date, fieldName: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DataAccessError(
      "INVALID_INPUT",
      `${fieldName} must be a valid date.`,
    );
  }

  return value;
}

export function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DataAccessError(
      "INVALID_INPUT",
      `${fieldName} must be a non-negative integer.`,
    );
  }

  return value;
}

export function assertListLimit(value: number | undefined): number {
  const limit = value ?? 50;

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DataAccessError(
      "INVALID_INPUT",
      "limit must be an integer between 1 and 100.",
    );
  }

  return limit;
}

export function assertListOffset(value: number | undefined): number {
  const offset = value ?? 0;

  if (!Number.isInteger(offset) || offset < 0) {
    throw new DataAccessError(
      "INVALID_INPUT",
      "offset must be a non-negative integer.",
    );
  }

  return offset;
}

export function assertEnumValue<T extends string>(
  value: string,
  allowedValues: readonly T[],
  fieldName: string,
): T {
  if (!allowedValues.includes(value as T)) {
    throw new DataAccessError(
      "INVALID_INPUT",
      `${fieldName} contains an unsupported value.`,
    );
  }

  return value as T;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertJsonObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (!isJsonObject(value)) {
    throw new DataAccessError(
      "INVALID_INPUT",
      `${fieldName} must be a JSON object.`,
    );
  }

  return value;
}

export function toJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}
