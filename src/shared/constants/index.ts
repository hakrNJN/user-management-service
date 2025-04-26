export const APP_CONSTANTS = {
    VERSION: '1.0.0',
    SERVICE_NAME: 'user-management-service', // Updated service name
    HEADERS: {
      REQUEST_ID: 'x-request-id',
      CORRELATION_ID: 'x-correlation-id',
      USER_AGENT: 'user-agent',
    },
    ERROR_CODES: {
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      NOT_FOUND: 'NOT_FOUND',
      UNAUTHORIZED: 'UNAUTHORIZED',
      FORBIDDEN: 'FORBIDDEN',
      CONFLICT: 'CONFLICT',
      INTERNAL_ERROR: 'INTERNAL_ERROR',
    },
    MFA_TYPES: {
      SMS: 'SMS',
      TOTP: 'TOTP',
      NONE: 'None',
    } as const,
    // Removed DYNAMODB section as the repository is not used
  } as const;
