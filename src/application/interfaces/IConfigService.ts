/**
 * Defines the contract for accessing application configuration values.
 * (Can be copied from Authentication/Account Management Service)
 */
export interface IConfigService {
    get<T = string>(key: string, defaultValue?: T): T | undefined;
    // getOrThrow<T = string>(key: string): T;
    getNumber(key: string, defaultValue?: number): number | undefined;
    // getNumberOrThrow(key: string): number;
    getBoolean(key: string, defaultValue?: boolean): boolean | undefined;
    // getBooleanOrThrow(key: string): boolean;
    isDevelopment(): boolean;
    isProduction(): boolean;
    isTest(): boolean;
    getAllConfig(): Record<string, any>;
    has(key: string): boolean;
}
