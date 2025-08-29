import { CircuitBreakerOptions } from '../../../../src/infrastructure/resilience/circuit-breaker.config';
import CircuitBreaker from 'opossum';

describe('CircuitBreakerOptions', () => {
    it('should define default circuit breaker options', () => {
        const options = CircuitBreakerOptions.default;
        expect(options).toBeDefined();
        expect(options.timeout).toBe(3000);
        expect(options.errorThresholdPercentage).toBe(50);
        expect(options.resetTimeout).toBe(30000);
    });

    it('should define cognito circuit breaker options', () => {
        const options = CircuitBreakerOptions.cognito;
        expect(options).toBeDefined();
        expect(options.timeout).toBe(5000);
        expect(options.errorThresholdPercentage).toBe(60);
        expect(options.resetTimeout).toBe(45000);
    });

    it('should define dynamodb circuit breaker options', () => {
        const options = CircuitBreakerOptions.dynamodb;
        expect(options).toBeDefined();
        expect(options.timeout).toBe(1500);
        expect(options.errorThresholdPercentage).toBe(50);
        expect(options.resetTimeout).toBe(20000);
    });
});