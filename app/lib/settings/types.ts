/**
 * User settings types for per-user configuration storage.
 */

export interface UserSettings {
  version: 1;
  traktUsername: string | null;
  imdbWatchlistIds: string[]; // Format: ur12345678 or ls12345678
  updatedAt: number; // Unix timestamp
}

/**
 * Validation status for a single source.
 */
export type ValidationStatus = "valid" | "invalid";

export interface TraktValidationCache {
  username: string;
  status: ValidationStatus;
  itemCount?: number;
  message?: string;
  validatedAt: number; // Unix timestamp
}

export interface IMDBValidationCache {
  listId: string;
  status: ValidationStatus;
  itemCount?: number;
  message?: string;
  validatedAt: number; // Unix timestamp
}

export interface ValidationCache {
  trakt: TraktValidationCache | null;
  imdb: IMDBValidationCache[];
}
