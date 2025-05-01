// src/application/interfaces/IConfigService.ts

/**
 * Defines the contract for accessing application configuration values.
 */
export interface IConfigService {
    /**
     * Retrieves a configuration value. Can optionally provide a default.
     * Considers undefined or empty string as "not set" when checking for default.
     * @param key - The configuration key.
     * @param defaultValue - Optional default value if the key is not found or is an empty string.
     * @returns The configuration value, or the default value, or undefined.
     */
    get<T = string>(key: string, defaultValue?: T): T | undefined;

    /**
     * Retrieves a configuration value. Throws an error if the key is not found or the value is empty.
     * @param key - The configuration key.
     * @returns The configuration value (typically string).
     * @throws {Error} If the configuration value is missing or empty.
     */
    getOrThrow<T = string>(key: string): T; // Primarily for strings, generic for flexibility

    /**
     * Retrieves a configuration value, ensuring it's a number.
     * @param key - The configuration key.
     * @param defaultValue - Optional default value if the key is not found, empty, or not a valid number.
     * @returns The configuration value as a number, or the default value, or undefined.
     * @throws Error if the value cannot be parsed as a number and no default is provided.
     */
    getNumber(key: string, defaultValue?: number): number | undefined;

    /**
     * Retrieves a configuration value, ensuring it's a number.
     * @param key - The configuration key.
     * @returns The configuration value as a number.
     * @throws {Error} If the configuration value is missing, empty, or not a valid number.
     */
    getNumberOrThrow(key: string): number; // Added

    /**
     * Retrieves a configuration value, ensuring it's a boolean.
     * Parses 'true', '1' as true, and 'false', '0' as false (case-insensitive).
     * @param key - The configuration key.
     * @param defaultValue - Optional default value if the key is not found, empty, or not a valid boolean representation.
     * @returns The configuration value as a boolean, or the default value, or undefined.
     * @throws Error if the value cannot be parsed as a boolean and no default is provided.
     */
    getBoolean(key: string, defaultValue?: boolean): boolean | undefined;

    /**
     * Retrieves a configuration value, ensuring it's a boolean.
     * Parses 'true', '1' as true, and 'false', '0' as false (case-insensitive).
     * @param key - The configuration key.
     * @returns The configuration value as a boolean.
     * @throws {Error} If the configuration value is missing, empty, or not a valid boolean representation.
     */
    getBooleanOrThrow(key: string): boolean; // Added

    isDevelopment(): boolean;
    isProduction(): boolean;
    isTest(): boolean;
    getAllConfig(): Record<string, any>; // Returns filtered config
    has(key: string): boolean;
    // reloadConfig might not be necessary or effective with --env-file, keep if external changes expected
    // reloadConfig(): void;
}