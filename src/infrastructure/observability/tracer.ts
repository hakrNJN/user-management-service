import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import * as path from 'path';
import * as fs from 'fs';

// Try to infer service name from package.json
let pkgName = 'user-management-service';
let pkgVersion = '1.0.0';
try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name) pkgName = pkg.name;
        if (pkg.version) pkgVersion = pkg.version;
    }
} catch (e) {
    // Ignore error
}

const serviceName = process.env.SERVICE_NAME || process.env.npm_package_name || pkgName;
const serviceVersion = process.env.SERVICE_VERSION || process.env.npm_package_version || pkgVersion;

// Uses OTEL_EXPORTER_OTLP_ENDPOINT from environment
const traceExporter = new OTLPTraceExporter();

const sdk = new NodeSDK({
    resource: new Resource({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations({
        // Disable noisy filesystem instrumentation
        '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
});

sdk.start();

process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log(`[OpenTelemetry] Tracing terminated for ${serviceName}`))
        .catch((error) => console.log(`[OpenTelemetry] Error terminating tracing for ${serviceName}`, error))
        .finally(() => process.exit(0));
});

console.log(`[OpenTelemetry] Tracer initialized for ${serviceName} v${serviceVersion}`);
