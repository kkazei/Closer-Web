import "server-only";

import { DataAccessError, toDataAccessError } from "./errors";

export async function withDataAccess<T>(
  operation: string,
  callback: () => Promise<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    throw toDataAccessError(error, operation);
  }
}

export function notFound(resource: string): never {
  throw new DataAccessError("NOT_FOUND", `${resource} was not found.`);
}

export function invalidInput(message: string): never {
  throw new DataAccessError("INVALID_INPUT", message);
}
