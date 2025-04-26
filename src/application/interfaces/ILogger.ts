/**
 * Defines the contract for logging services throughout the application.
 * (Can be copied from Authentication/Account Management Service)
 */
export interface ILogger {
    /**
     * Logs an informational message.
     * @param message - The message to log.
     * @param meta - Optional metadata to include with the log.
     */
    info(message: string, meta?: Record<string, any>): void;

    /**
     * Logs a warning message.
     * @param message - The message to log.
     * @param meta - Optional metadata to include with the log.
     */
    warn(message: string, meta?: Record<string, any>): void;

    /**
     * Logs an error message.
     * @param message - The message to log.
     * @param error - Optional error object or details.
     * @param meta - Optional metadata to include with the log.
     */
    error(message: string, error?: Error | any, meta?: Record<string, any>): void;

    /**
     * Logs a debug message.
     * @param message - The message to log.
     * @param meta - Optional metadata to include with the log.
     */
    debug(message: string, meta?: Record<string, any>): void;

    /**
     * Logs a message with a specific level.
     */
    log?(level: string, message: string, meta?: Record<string, any>): void;
}
