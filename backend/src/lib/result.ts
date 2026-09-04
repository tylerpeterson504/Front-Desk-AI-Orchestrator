/**
 * Result Type Pattern Implementation
 * 
 * This module implements the Result type pattern (similar to Rust's Result)
 * for handling operations that can succeed or fail without using exceptions.
 * 
 * Benefits:
 * - Explicit error handling without try/catch
 * - Better type safety for error cases
 * - Forces callers to handle both success and error cases
 * - Composable operations with chaining
 */

/**
 * Base Result type - either Ok (success) or Err (failure)
 */
export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

/**
 * Success result wrapper
 */
export class Ok<T, E = Error> {
  public readonly success: true = true;
  public readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  /**
   * Check if this result is successful
   */
  isOk(): this is Ok<T, E> {
    return true;
  }

  /**
   * Check if this result is an error
   */
  isErr(): this is Err<T, E> {
    return false;
  }

  /**
   * Map the value if successful
   */
  map<U>(fn: (value: T) => U): Ok<U, E> {
    return new Ok(fn(this.value));
  }

  /**
   * Flat map (chain operations)
   */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }

  /**
   * Map the error (no-op for Ok)
   */
  mapErr<F>(_fn: (error: E) => F): Ok<T, F> {
    return this as unknown as Ok<T, F>;
  }

  /**
   * Unwrap the value (throws if error)
   */
  unwrap(): T {
    return this.value;
  }

  /**
   * Unwrap with default value
   */
  unwrapOr(_default: T): T {
    return this.value;
  }

  /**
   * Unwrap or else compute default
   */
  unwrapOrElse(_fn: () => T): T {
    return this.value;
  }

  /**
   * Match on result
   */
  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.ok(this.value);
  }
}

/**
 * Error result wrapper
 */
export class Err<T, E = Error> {
  public readonly success: false = false;
  public readonly error: E;

  constructor(error: E) {
    this.error = error;
  }

  /**
   * Check if this result is successful
   */
  isOk(): this is Ok<T, E> {
    return false;
  }

  /**
   * Check if this result is an error
   */
  isErr(): this is Err<T, E> {
    return true;
  }

  /**
   * Map the value (no-op for Err)
   */
  map<U>(_fn: (value: T) => U): Err<U, E> {
    return this as unknown as Err<U, E>;
  }

  /**
   * Flat map (no-op for Err)
   */
  flatMap<U>(_fn: (value: T) => Result<U, E>): Err<U, E> {
    return this as unknown as Err<U, E>;
  }

  /**
   * Map the error
   */
  mapErr<F>(fn: (error: E) => F): Err<T, F> {
    return new Err(fn(this.error));
  }

  /**
   * Unwrap the value (throws if error)
   */
  unwrap(): T {
    throw this.error instanceof Error ? this.error : new Error(String(this.error));
  }

  /**
   * Unwrap with default value
   */
  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }

  /**
   * Unwrap or else compute default
   */
  unwrapOrElse(fn: () => T): T {
    return fn();
  }

  /**
   * Match on result
   */
  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.err(this.error);
  }
}

/**
 * Create a successful result
 */
export function ok<T, E = Error>(value: T): Result<T, E> {
  return new Ok(value);
}

/**
 * Create an error result
 */
export function err<T, E = Error>(error: E): Result<T, E> {
  return new Err(error);
}

/**
 * Wrap a promise-returning function to return a Result
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(error as E);
  }
}

/**
 * Wrap a synchronous function to return a Result
 */
export function fromTry<T, E = Error>(
  fn: () => T
): Result<T, E> {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    return err(error as E);
  }
}

/**
 * Convert an array of Results to a Result containing an array
 * If any Result is an error, returns the first error
 */
export function collect<T, E = Error>(
  results: Result<T, E>[]
): Result<T[], E> {
  const values: T[] = [];
  
  for (const result of results) {
    if (result.isErr()) {
      return result as Err<T[], E>;
    }
    values.push(result.value);
  }
  
  return ok(values);
}

/**
 * Convert an array of Results to a Result containing an array
 * Collects all errors if any fail
 */
export function collectAll<T, E = Error>(
  results: Result<T, E>[]
): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];
  
  for (const result of results) {
    if (result.isErr()) {
      errors.push(result.error);
    } else {
      values.push(result.value);
    }
  }
  
  if (errors.length > 0) {
    return err(errors);
  }
  
  return ok(values);
}

/**
 * Find the first successful result in an array
 */
export function findOk<T, E = Error>(
  results: Result<T, E>[]
): Result<T, E> | null {
  for (const result of results) {
    if (result.isOk()) {
      return result;
    }
  }
  return null;
}

/**
 * Find the first error result in an array
 */
export function findErr<T, E = Error>(
  results: Result<T, E>[]
): Result<T, E> | null {
  for (const result of results) {
    if (result.isErr()) {
      return result;
    }
  }
  return null;
}

/**
 * Partition an array of Results into successes and errors
 */
export function partition<T, E = Error>(
  results: Result<T, E>[]
): { ok: T[]; err: E[] } {
  const ok: T[] = [];
  const err: E[] = [];
  
  for (const result of results) {
    if (result.isOk()) {
      ok.push(result.value);
    } else {
      err.push(result.error);
    }
  }
  
  return { ok, err };
}

/**
 * Tap into a Result for side effects (logging, etc.)
 */
export function tap<T, E = Error>(
  result: Result<T, E>,
  handlers: {
    ok?: (value: T) => void;
    err?: (error: E) => void;
  }
): Result<T, E> {
  if (result.isOk() && handlers.ok) {
    handlers.ok(result.value);
  } else if (result.isErr() && handlers.err) {
    handlers.err(result.error);
  }
  return result;
}

/**
 * Convert Result to Promise (for interop with async/await)
 */
export async function toPromise<T, E = Error>(
  result: Result<T, E>
): Promise<T> {
  if (result.isOk()) {
    return result.value;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

/**
 * Convert Result to a simple object with success/error properties
 */
export function toObject<T, E = Error>(
  result: Result<T, E>
): { success: boolean; data?: T; error?: E } {
  if (result.isOk()) {
    return { success: true, data: result.value };
  }
  return { success: false, error: result.error };
}

/**
 * Convert from a simple object to Result
 */
export function fromObject<T, E = Error>(
  obj: { success: boolean; data?: T; error?: E }
): Result<T, E> {
  if (obj.success && obj.data !== undefined) {
    return ok(obj.data);
  }
  if (!obj.success && obj.error !== undefined) {
    return err(obj.error);
  }
  return err(new Error('Invalid result object') as unknown as E);
}

/**
 * Async version of collect
 */
export async function collectAsync<T, E = Error>(
  promises: Promise<Result<T, E>>[]
): Promise<Result<T[], E>> {
  const results = await Promise.all(promises);
  return collect(results);
}

/**
 * Async version of collectAll
 */
export async function collectAllAsync<T, E = Error>(
  promises: Promise<Result<T, E>>[]
): Promise<Result<T[], E[]>> {
  const results = await Promise.all(promises);
  return collectAll(results);
}

/**
 * Retry a Result-returning operation with backoff
 */
export async function retry<T, E = Error>(
  operation: () => Result<T, E>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: E) => boolean;
  } = {}
): Promise<Result<T, E>> {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    maxDelay = 10000,
    shouldRetry = () => true
  } = options;

  let lastResult: Result<T, E> | null = null;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    lastResult = operation();
    
    if (lastResult.isOk()) {
      return lastResult;
    }
    
    if (attempt >= maxAttempts) {
      break;
    }
    
    if (!shouldRetry(lastResult.error)) {
      break;
    }
    
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  return lastResult!;
}

/**
 * Timeout wrapper for async operations
 */
export async function withTimeout<T, E = Error>(
  promise: Promise<Result<T, E>>,
  timeoutMs: number,
  timeoutError: E
): Promise<Result<T, E>> {
  const timeoutPromise = new Promise<Result<T, E>>((resolve) => {
    setTimeout(() => {
      resolve(err(timeoutError));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

export default {
  // Types
  Ok,
  Err,
  
  // Constructors
  ok,
  err,
  
  // Promise interop
  fromPromise,
  fromTry,
  toPromise,
  
  // Array operations
  collect,
  collectAll,
  findOk,
  findErr,
  partition,
  collectAsync,
  collectAllAsync,
  
  // Utility functions
  tap,
  toObject,
  fromObject,
  
  // Advanced operations
  retry,
  withTimeout
};
