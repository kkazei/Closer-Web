export const DATA_ACCESS_ERROR_CODES = [
  "NOT_FOUND",
  "DATABASE_ERROR",
  "CONSTRAINT_ERROR",
  "INVALID_INPUT",
] as const;

export type DataAccessErrorCode = (typeof DATA_ACCESS_ERROR_CODES)[number];

/**
 * Safe error contract for callers above the data-access layer.
 * Database messages and SQL details are intentionally not exposed.
 */
export class DataAccessError extends Error {
  readonly code: DataAccessErrorCode;

  constructor(code: DataAccessErrorCode, message: string) {
    super(message);
    this.name = "DataAccessError";
    this.code = code;
  }
}

function getSqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function isConstraintError(error: unknown): boolean {
  return getSqlState(error)?.startsWith("23") ?? false;
}

export function toDataAccessError(
  error: unknown,
  operation: string,
): DataAccessError {
  if (error instanceof DataAccessError) {
    return error;
  }

  if (isConstraintError(error)) {
    return new DataAccessError(
      "CONSTRAINT_ERROR",
      `The requested ${operation} conflicts with a database rule.`,
    );
  }

  return new DataAccessError(
    "DATABASE_ERROR",
    `The ${operation} could not be completed.`,
  );
}
