import 'reflect-metadata'; // REQUIRED for tsyringe DI decorators
// Removed direct Express imports as setup is moved to app.ts
import { createApp } from './app'; // Import the app creation function
import { IConfigService } from './application/interfaces/IConfigService';
import { ILogger } from './application/interfaces/ILogger';
import { container } from './container'; // DI container setup remains essential
import { TYPES } from './shared/constants/types';

async function bootstrap() {
    let logger: ILogger | undefined; // Define logger variable

    try {
        // --- Dependency Injection & Configuration ---
        // Resolve config first to ensure required keys are checked during its construction
        const configService = container.resolve<IConfigService>(TYPES.ConfigService);
        // Now resolve logger
        logger = container.resolve<ILogger>(TYPES.Logger);

        logger.info('Application bootstrapping...');
        logger.info(`Environment: ${configService.get('NODE_ENV')}`);
        logger.debug('Configuration loaded successfully.'); // Config details logged by service constructor

        // --- Create Express App ---
        // Delegate app creation and configuration to the createApp function
        const app = createApp();

        // --- Server Startup ---
        const port = configService.getNumber('PORT'); // Already validated in ConfigService constructor

        if (port === undefined) {
            // This case should theoretically not be reached if PORT is required
            logger.error('PORT configuration is missing or invalid despite initial checks.');
            process.exit(1);
        }

        const server = app.listen(port, () => {
            logger?.info(`🚀 Server listening on port ${port}`); // Use optional chaining for logger
        });

        // --- Graceful Shutdown Handling ---
        const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

        signals.forEach((signal) => {
            process.on(signal, async () => {
                logger?.info(`Received ${signal}, shutting down gracefully...`);
                server.close(async (err) => {
                    if (err) {
                        logger?.error('Error during server shutdown:', err);
                        process.exit(1);
                    }
                    logger?.info('Server closed.');
                    // Add any other cleanup logic here
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Allow time for logs to flush
                    process.exit(0);
                });

                const shutdownTimeout = configService.getNumber('SHUTDOWN_TIMEOUT', 10000);

                setTimeout(() => {
                    logger?.warn('Graceful shutdown timed out, forcing exit.');
                    process.exit(1);
                }, shutdownTimeout);
            });
        });

        // --- Global Error Handlers ---
        process.on('unhandledRejection', (reason: Error | any, promise: Promise<any>) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            logger?.error('Unhandled Rejection:', error, {
                promiseContext: promise,
                code: 'UNHANDLED_REJECTION',
                message: 'An unhandled rejection occurred. The application may be in an unstable state.'
            });
            // Decide on exiting strategy
        });

        process.on('uncaughtException', (err: Error, origin: string) => {
            logger?.error(`Uncaught Exception: ${err.message}`, err, {
                origin: origin,
                code: 'UNCAUGHT_EXCEPTION',
                message: 'An uncaught exception occurred. The application is exiting.'
            });
            logger?.info('Exiting due to uncaught exception...');
             // Attempt a quick log flush before exiting
            setTimeout(() => process.exit(1), 500);
        });

    } catch (error: any) {
        // Catch bootstrap errors (e.g., config validation, DI resolution)
        const errorMsg = `❌ Fatal error during application bootstrap: ${error.message || error}`;
        // Use console.error as logger might not be initialized if error happened early
        console.error(errorMsg, error.stack);
        // Ensure logger attempts to log if available
        logger?.error(errorMsg, error, {
            code: 'BOOTSTRAP_ERROR',
            message: 'Application failed to start due to a configuration or dependency error. Check the logs for details.'
        });
        process.exit(1);
    }
}

// --- Start the Application ---
bootstrap(); // No catch here as it's handled inside bootstrap
