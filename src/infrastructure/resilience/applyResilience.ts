import CircuitBreaker from 'opossum';
import { ILogger } from '../../application/interfaces/ILogger'; // Assuming logger is available
import { CircuitBreakerOptions } from './circuit-breaker.config'; // Import defined options

/**
 * Wraps an asynchronous function with a circuit breaker pattern using opossum.
 *
 * @template TArgs - Tuple type for the arguments of the async function.
 * @template TReturn - Return type of the async function.
 * @param asyncFunction - The asynchronous function to wrap.
 * @param optionsKey - The key corresponding to the desired options in CircuitBreakerOptions (e.g., 'default', 'cognito').
 * @param logger - An optional logger instance to log circuit breaker events.
 * @returns A new function that, when called, executes the original function through the circuit breaker.
 */
export function applyCircuitBreaker<TArgs extends any[], TReturn>(
    asyncFunction: (...args: TArgs) => Promise<TReturn>,
    optionsKey: keyof typeof CircuitBreakerOptions = 'default',
    logger?: ILogger // Make logger optional or ensure it's always passed via DI context
): (...args: TArgs) => Promise<TReturn> {

    const options = CircuitBreakerOptions[optionsKey] || CircuitBreakerOptions.default;
    const breaker = new CircuitBreaker(asyncFunction, options);

    // Optional: Log circuit breaker events if a logger is provided
    if (logger) {
        const serviceName = asyncFunction.name || 'UnnamedService'; // Try to get function name

        breaker.on('open', () => logger.warn(`CircuitBreaker (${serviceName}) opened. Service failing.`));
        breaker.on('close', () => logger.info(`CircuitBreaker (${serviceName}) closed. Service restored.`));
        breaker.on('halfOpen', () => logger.info(`CircuitBreaker (${serviceName}) halfOpen. Attempting test request.`));
        breaker.on('fallback', (result, error) => logger.warn(`CircuitBreaker (${serviceName}) fallback executed.`, { result, error: error?.message }));
        breaker.on('failure', (error) => logger.error(`CircuitBreaker (${serviceName}) failure detected.`, error));
        breaker.on('success', (result) => logger.debug(`CircuitBreaker (${serviceName}) success.` /*, { result } - avoid logging potentially large results */));
        breaker.on('timeout', () => logger.warn(`CircuitBreaker (${serviceName}) timed out.`));
        breaker.on('reject', () => logger.warn(`CircuitBreaker (${serviceName}) rejected.`)); // When open or half-open and called
    }

    // Return a function that uses the breaker's fire method
    return (...args: TArgs): Promise<TReturn> => {
        return breaker.fire(...args);
    };
}

// --- Example Usage (within another service/adapter) ---
/*
import { applyCircuitBreaker } from './applyResilience';
import { someExternalCall } from './externalServiceClient';
import { logger } from '../logging'; // Assuming logger instance

const resilientExternalCall = applyCircuitBreaker(someExternalCall, 'default', logger);

async function fetchData() {
    try {
        const data = await resilientExternalCall('some-argument');
        // process data
    } catch (error) {
        // Handle error (e.g., from circuit breaker being open or the call failing)
        logger.error('Failed to fetch data via circuit breaker', error);
    }
}
*/

