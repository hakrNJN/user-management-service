import CircuitBreaker from 'opossum'; // Import opossum

/**
 * Defines configuration options for circuit breakers (using opossum).
 */
export const CircuitBreakerOptions: Record<string, CircuitBreaker.Options> = {
    /**
     * Default options suitable for many external calls.
     */
    default: {
        timeout: 3000, // If function takes longer than 3 seconds, trigger a failure
        errorThresholdPercentage: 50, // When 50% of requests fail, trip the circuit
        resetTimeout: 30000, // After 30 seconds, try again.
        // Optional: Add volumeThreshold, rollingCountTimeout, etc. as needed
        // volumeThreshold: 10, // Minimum number of requests before calculating error percentage
    },

    /**
     * Specific options for Cognito calls, potentially more tolerant or faster timeout.
     */
    cognito: {
        timeout: 5000, // Slightly longer timeout for potential IdP latency
        errorThresholdPercentage: 60, // Be slightly more tolerant of Cognito errors?
        resetTimeout: 45000, // Longer reset period
        // volumeThreshold: 5,
    },

    /**
     * Specific options for DynamoDB calls, likely expecting faster responses.
     */
    dynamodb: {
        timeout: 1500, // Expect DynamoDB to be fast
        errorThresholdPercentage: 50,
        resetTimeout: 20000,
        // volumeThreshold: 20, // Require more traffic before tripping
    },

    // Add configurations for other external services as needed
};

