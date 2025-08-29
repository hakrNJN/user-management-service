describe('Prometheus Metrics', () => {
    let mockRegistryInstance: any;
    let mockCounterInstance: any;
    let mockHistogramInstance: any;
    let mockCollectDefaultMetrics: jest.Mock;

    beforeEach(() => {
        // Reset module cache to ensure fresh imports
        jest.resetModules();

        // Create fresh mock instances
        mockRegistryInstance = {
            setDefaultLabels: jest.fn(),
            registerMetric: jest.fn(),
        };

        mockCounterInstance = {
            inc: jest.fn(),
            labels: jest.fn().mockReturnThis(),
        };

        mockHistogramInstance = {
            observe: jest.fn(),
            startTimer: jest.fn(),
            labels: jest.fn().mockReturnThis(),
        };

        mockCollectDefaultMetrics = jest.fn();

        // Mock prom-client with fresh instances using doMock
        jest.doMock('prom-client', () => ({
            Registry: jest.fn(() => mockRegistryInstance),
            Counter: jest.fn(() => mockCounterInstance),
            Histogram: jest.fn(() => mockHistogramInstance),
            collectDefaultMetrics: mockCollectDefaultMetrics,
        }));
    });

    afterEach(() => {
        // Clean up mocks
        jest.dontMock('prom-client');
    });

    it('should initialize a new Registry', () => {
        // Import the module after mocks are set up
        require('../../../../src/infrastructure/monitoring/metrics');

        const { Registry } = require('prom-client');
        expect(Registry).toHaveBeenCalledTimes(1);
    });

    it('should set default labels on the registry', () => {
        // Import the module after mocks are set up
        require('../../../../src/infrastructure/monitoring/metrics');

        expect(mockRegistryInstance.setDefaultLabels).toHaveBeenCalledTimes(1);
        expect(mockRegistryInstance.setDefaultLabels).toHaveBeenCalledWith({
            serviceName: 'user-management-service',
        });
    });

    it('should collect default metrics', () => {
        // Import the module after mocks are set up
        require('../../../../src/infrastructure/monitoring/metrics');

        expect(mockCollectDefaultMetrics).toHaveBeenCalledTimes(1);
        expect(mockCollectDefaultMetrics).toHaveBeenCalledWith({ register: mockRegistryInstance });
    });

    it('should define httpRequestCounter', () => {
        // Import the module after mocks are set up
        require('../../../../src/infrastructure/monitoring/metrics');

        const { Counter } = require('prom-client');
        expect(Counter).toHaveBeenCalledTimes(1);
        expect(Counter).toHaveBeenCalledWith({
            name: 'http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status_code'],
            registers: [mockRegistryInstance],
        });
    });

    it('should define httpRequestDurationMicroseconds', () => {
        // Import the module after mocks are set up
        require('../../../../src/infrastructure/monitoring/metrics');

        const { Histogram } = require('prom-client');
        expect(Histogram).toHaveBeenCalledTimes(1);
        expect(Histogram).toHaveBeenCalledWith({
            name: 'http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route', 'code'],
            buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
            registers: [mockRegistryInstance],
        });
    });

    it('should export registry and metrics for external use', () => {
        const metricsModule = require('../../../../src/infrastructure/monitoring/metrics');

        // Verify that the module exports what's expected
        expect(metricsModule).toBeDefined();
        // Add specific expectations based on your metrics module's exports
        // For example, if it exports registry, httpRequestCounter, etc.
    });
});
