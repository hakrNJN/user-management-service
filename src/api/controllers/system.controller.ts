import { NextFunction, Request, Response } from 'express';
import os from 'os'; // For OS level info
import process from 'process'; // For Node.js info
import { inject, injectable } from 'tsyringe';
import { IConfigService } from '../../application/interfaces/IConfigService';
import { TYPES } from '../../shared/constants/types';
// import fs from 'fs'; // Uncomment if reading package.json
// import path from 'path'; // Uncomment if reading package.json

@injectable()
export class SystemController {
    // private packageInfo: Record<string, any> = {}; // To store package.json info

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService
    ) {
        // Uncomment to read package.json on startup
        /*
        try {
            const packageJsonPath = path.resolve(process.cwd(), 'package.json');
            const rawData = fs.readFileSync(packageJsonPath, 'utf-8');
            this.packageInfo = JSON.parse(rawData);
        } catch (error) {
            console.error("Could not read package.json for server info:", error);
            this.packageInfo = { name: 'unknown', version: 'unknown' };
        }
        */
    }

    /**
     * Handles health check requests.
     * GET /health (or /api/system/health if mounted under /api/system)
     */
    getHealth = (req: Request, res: Response, next: NextFunction): void => {
        try {
            // Basic health check - can be expanded later (e.g., check DB, IdP connectivity)
            res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
        } catch (error) {
            next(error); // Pass errors to global handler
        }
    };

    /**
     * Handles server information requests.
     * GET /server-info (or /api/system/server-info)
     */
    getServerInfo = (req: Request, res: Response, next: NextFunction): void => {
        try {
            const info = {
                nodeVersion: process.version,
                environment: this.configService.get('NODE_ENV', 'development'),
                // Application Info (Uncomment if package.json reading is enabled)
                // appName: this.packageInfo.name,
                // appVersion: this.packageInfo.version,
                os: {
                    platform: os.platform(),
                    arch: os.arch(),
                    release: os.release(),
                    // totalMemory: os.totalmem(), // Consider if exposing memory is desired
                    // freeMemory: os.freemem(),
                },
                // Add other relevant info (e.g., region if applicable)
                // region: this.configService.get('AWS_REGION'),
                timestamp: new Date().toISOString(),
            };
            res.status(200).json(info);
        } catch (error) {
            next(error);
        }
    };
}
