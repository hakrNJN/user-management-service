import { Request, Response, NextFunction } from 'express';
import { httpRequestCounter, httpRequestDurationMicroseconds } from '../../infrastructure/monitoring/metrics';

export const requestMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  
  res.on('finish', () => {
    const route = req.route ? req.route.path : 'unknown_route';
    const statusCode = res.statusCode;

    // Increment request counter
    httpRequestCounter.inc({
      method: req.method,
      route: route,
      status_code: statusCode,
    });

    // Observe request duration
    end({ 
      method: req.method,
      route: route,
      code: statusCode,
    });
  });

  next();
};
