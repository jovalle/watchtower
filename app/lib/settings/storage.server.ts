/**
 * User settings storage service.
 * Stores per-user settings as JSON files keyed by Plex user ID.
 * Follows patterns from watchlist/cache.server.ts.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { env } from "~/lib/env.server";
import type { UserSettings, ValidationCache, TraktValidationCache, IMDBValidationCache } from "./types";

// Storage configuration
const SETTINGS_DIR = "settings";

/**
 * Get the settings directory path.
 */
function getSettingsDir(): string {
  return path.join(env.DATA_PATH, SETTINGS_DIR);
}

/**
 * Get the settings file path for a specific user.
 */
function getSettingsPath(userId: number): string {
  return path.join(getSettingsDir(), `user-${userId}.json`);
}

/**
 * Ensure settings directory exists.
 */
async function ensureSettingsDir(): Promise<void> {
  await fs.mkdir(getSettingsDir(), { recursive: true });
}

/**
 * Get default settings with empty/null values.
 */
export function getDefaultSettings(): UserSettings {
  return {
    version: 1,
    traktUsername: null,
    imdbWatchlistIds: [],
    updatedAt: Date.now(),
  };
}

/**
 * Load user settings from storage.
 * Returns null if settings file doesn't exist or is invalid.
 */
export async function getUserSettings(userId: number): Promise<UserSettings | null> {
  try {
    const data = await fs.readFile(getSettingsPath(userId), "utf-8");
    const settings = JSON.parse(data) as UserSettings;

    if (settings.version !== 1) {
      console.log(`[UserSettings] Version mismatch for user ${userId}, returning null`);
      return null;
    }

    console.log(`[UserSettings] Loaded settings for user ${userId}`);
    return settings;
  } catch {
    // File doesn't exist or is invalid
    return null;
  }
}

/**
 * Save user settings to storage.
 * Merges partial settings with existing settings or defaults.
 */
export async function setUserSettings(
  userId: number,
  settings: Partial<Omit<UserSettings, "version" | "updatedAt">>
): Promise<void> {
  try {
    await ensureSettingsDir();

    // Load existing settings or use defaults
    const existing = (await getUserSettings(userId)) ?? getDefaultSettings();

    // Merge with new settings
    const updated: UserSettings = {
      ...existing,
      ...settings,
      version: 1,
      updatedAt: Date.now(),
    };

    await fs.writeFile(getSettingsPath(userId), JSON.stringify(updated, null, 2));
    console.log(`[UserSettings] Saved settings for user ${userId}`);
  } catch (error) {
    console.error(`[UserSettings] Failed to save settings for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Delete user settings file.
 */
export async function deleteUserSettings(userId: number): Promise<void> {
  try {
    await fs.unlink(getSettingsPath(userId));
    console.log(`[UserSettings] Deleted settings for user ${userId}`);
  } catch {
    // Ignore if file doesn't exist
  }
}

// Validation cache storage

/**
 * Get the validation cache file path for a specific user.
 */
function getValidationCachePath(userId: number): string {
  return path.join(getSettingsDir(), `validation-${userId}.json`);
}

/**
 * Get default empty validation cache.
 */
export function getDefaultValidationCache(): ValidationCache {
  return {
    trakt: null,
    imdb: [],
  };
}

/**
 * Load validation cache for a user.
 */
export async function getValidationCache(userId: number): Promise<ValidationCache> {
  try {
    const data = await fs.readFile(getValidationCachePath(userId), "utf-8");
    const cache = JSON.parse(data) as ValidationCache;
    return cache;
  } catch {
    return getDefaultValidationCache();
  }
}

/**
 * Save validation cache for a user.
 */
export async function setValidationCache(
  userId: number,
  cache: ValidationCache
): Promise<void> {
  try {
    await ensureSettingsDir();
    await fs.writeFile(getValidationCachePath(userId), JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error(`[ValidationCache] Failed to save for user ${userId}:`, error);
  }
}

/**
 * Update Trakt validation cache for a user.
 */
export async function setTraktValidation(
  userId: number,
  validation: TraktValidationCache | null
): Promise<void> {
  const cache = await getValidationCache(userId);
  cache.trakt = validation;
  await setValidationCache(userId, cache);
}

/**
 * Update IMDB validation cache for a user.
 * This replaces all IMDB validations.
 */
export async function setIMDBValidations(
  userId: number,
  validations: IMDBValidationCache[]
): Promise<void> {
  const cache = await getValidationCache(userId);
  cache.imdb = validations;
  await setValidationCache(userId, cache);
}
