/**
 * Shared TypeScript types for Closer.
 *
 * Application-wide type definitions that don't belong
 * to a specific feature or database schema.
 */

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Application environment configuration.
 * Used to validate required environment variables at startup.
 */
export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  databaseUrl: string;
}
