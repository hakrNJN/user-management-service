# User Management Service

This service is a core component of the PBAC system, responsible for managing users, roles, groups, permissions, and policies. It also provides policy bundles for Open Policy Agent (OPA).

## Table of Contents
- [Folder Structure](#folder-structure)
- [Tech Stack](#tech-stack)
- [Design Patterns and Principles](#design-patterns-and-principles)
- [Purpose and Key Functionalities](#purpose-and-key-functionalities)
- [API Endpoints](#api-endpoints)
- [Dependencies](#dependencies)
- [Environment Variables](#environment-variables)
- [Local Setup Instructions](#local-setup-instructions)

## Folder Structure
```
user-management-service/
├── src/
│   ├── api/                  # API layer (controllers, DTOs, middlewares, routes)
│   │   ├── controllers/      # Request handling logic
│   │   ├── dtos/             # Data Transfer Objects for request/response validation
│   │   ├── middlewares/      # Express middleware (e.g., authentication, authorization)
│   │   └── routes/           # Defines API endpoints and maps to controllers
│   ├── application/          # Application layer (orchestrates domain logic, use cases)
│   ├── domain/               # Domain layer (core business logic, entities, policies)
│   ├── infrastructure/       # Infrastructure layer (database interactions, external services, logging)
│   ├── shared/               # Shared utilities, types, constants
│   ├── app.ts                # Express application setup
│   ├── container.ts          # Dependency Injection container setup (tsyringe)
│   └── main.ts               # Application entry point
├── tests/                    # Unit, Integration, and E2E tests
├── .env.example              # Example environment variables
├── Dockerfile                # Docker build instructions
├── package.json              # Project dependencies and scripts
├── pnpm-lock.yaml            # pnpm lock file
└── README.md                 # This documentation
```

## Tech Stack
- **Language:** TypeScript
- **Runtime:** Node.js
- **Web Framework:** Express.js
- **Package Manager:** pnpm
- **Database:** AWS DynamoDB (via AWS SDK)
- **Authentication/Authorization:** JSON Web Tokens (JWT), JWKS-RSA (for JWT verification)
- **Dependency Injection:** tsyringe
- **Validation:** class-validator, Zod
- **Logging:** Winston (with CloudWatch and Elasticsearch transports)
- **Observability:** OpenTelemetry (for tracing and metrics), Prometheus (via `prom-client`)
- **Resilience:** Opossum (Circuit Breaker)
- **Archiving:** Archiver (for creating OPA policy bundles)

## Design Patterns and Principles
- **Layered Architecture:** The service is structured into distinct layers (API, Application, Domain, Infrastructure) to promote separation of concerns and maintainability.
- **Dependency Injection:** Utilizes `tsyringe` to manage dependencies, making the codebase more modular and testable.
- **Circuit Breaker:** Implements the Circuit Breaker pattern using `opossum` to prevent cascading failures and improve system resilience.
- **Observability:** Designed with observability in mind, integrating OpenTelemetry for distributed tracing and `prom-client` for Prometheus metrics.
- **Policy Bundle Generation:** Dynamically generates OPA policy bundles, enabling external policy enforcement.

## Purpose and Key Functionalities
**Purpose:** To provide comprehensive management of users, their roles, groups, and permissions, and to serve as the central repository for policy definitions within the PBAC system.

**Key Functionalities:**
- **User Management:** CRUD operations for users, including attribute updates, activation/deactivation, password management, and group membership management.
- **Group Management:** CRUD operations for groups, including role assignments and user listing.
- **Role Management:** CRUD operations for roles, including permission assignments.
- **Permission Management:** CRUD operations for permissions.
- **Policy Management:** CRUD operations for policies, including versioning and rollback capabilities.
- **OPA Policy Bundle Provisioning:** Generates and serves policy bundles to Open Policy Agent (OPA) instances.
- **System Monitoring:** Provides health check, server information, and Prometheus metrics endpoints for operational visibility.

## API Endpoints

### Admin User Routes (Prefix: `/admin/users`)
These endpoints require JWT authentication and an appropriate admin role.

- `POST /`: Create a new user.
- `GET /`: List users (with optional query parameters for filtering).
- `GET /:username`: Retrieve details for a specific user.
- `PUT /:username/attributes`: Update attributes for a specific user.
- `DELETE /:username`: Deactivate a user.
- `PUT /:username/reactivate`: Reactivate a deactivated user.
- `POST /:username/initiate-password-reset`: Initiate a password reset for a user.
- `POST /:username/set-password`: Set a new password for a user.
- `POST /:username/groups`: Add a user to a group.
- `DELETE /:username/groups/:groupName`: Remove a user from a group.
- `GET /:username/groups`: List groups a user belongs to.

### Admin Group Routes (Prefix: `/admin/groups`)
These endpoints require JWT authentication and an appropriate admin role.

- `POST /`: Create a new group.
- `GET /`: List groups.
- `GET /:groupName`: Retrieve details for a specific group.
- `DELETE /:groupName`: Delete a group.
- `PUT /:groupName/reactivate`: Reactivate a deactivated group.
- `POST /:groupName/roles`: Assign a role to a group.
- `DELETE /:groupName/roles/:roleName`: Remove a role from a group.
- `GET /:groupName/roles`: List roles assigned to a group.

### Admin Permission Routes (Prefix: `/admin/permissions`)
These endpoints require JWT authentication and an appropriate admin role.

- `POST /`: Create a new permission.
- `GET /`: List permissions.
- `GET /:permissionName`: Retrieve details for a specific permission.
- `PUT /:permissionName`: Update a permission.
- `DELETE /:permissionName`: Delete a permission.
- `GET /:permissionName/roles`: List roles associated with a permission.

### Admin Role Routes (Prefix: `/admin/roles`)
These endpoints require JWT authentication and an appropriate admin role.

- `POST /`: Create a new role.
- `GET /`: List roles.
- `GET /:roleName`: Retrieve details for a specific role.
- `PUT /:roleName`: Update a role.
- `DELETE /:roleName`: Delete a role.
- `POST /:roleName/permissions`: Assign a permission to a role.
- `DELETE /:roleName/permissions/:permissionName`: Remove a permission from a role.
- `GET /:roleName/permissions`: List permissions assigned to a role.

### Admin Policy Routes (Prefix: `/admin/policies`)
These endpoints require JWT authentication and an appropriate admin role.

- `POST /`: Create a new policy.
- `GET /`: List policies.
- `GET /:policyId`: Retrieve details for a specific policy (latest version).
- `PUT /:policyId`: Update a policy (creates a new version).
- `DELETE /:policyId`: Deactivate/Delete a policy.
- `GET /:policyId/versions/:version`: Retrieve a specific version of a policy.
- `GET /:policyId/versions`: List all versions for a policy.
- `POST /:policyId/rollback/:version`: Rollback a policy to a specific version.

### Public Policy Routes (Prefix: `/policies`)

- `GET /bundle`: Retrieves all active policies as an OPA-compatible bundle. This endpoint is typically consumed by OPA instances.

### System Endpoints

- `GET /health`: Returns the health status of the service.
- `GET /server-info`: Provides general information about the server and service.
- `GET /metrics`: Exposes Prometheus-compatible metrics for monitoring.

## Dependencies
Key dependencies include:
- `@aws-sdk/client-dynamodb`, `@aws-sdk/util-dynamodb`: For interacting with AWS DynamoDB.
- `express`: Web framework.
- `jsonwebtoken`, `jwks-rsa`: For JWT handling and verification.
- `tsyringe`: Dependency injection container.
- `class-validator`, `zod`: For data validation.
- `winston`: Logging library.
- `@opentelemetry/*`: For distributed tracing and metrics.
- `prom-client`: For Prometheus metrics.
- `opossum`: For circuit breaker implementation.
- `archiver`: For creating policy bundles.

## Environment Variables
Configuration is managed via environment variables. A `.env.example` file is provided as a template.

| Variable                  | Description                                          | Example Value       |
|---------------------------|------------------------------------------------------|---------------------|
| `NODE_ENV`                | Node.js environment (e.g., development, production). | `development`       |
| `PORT`                    | Port on which the service will listen.               | `3002`              |
| `LOG_LEVEL`               | Minimum logging level (e.g., info, debug, error).    | `info`              |
| `AWS_REGION`              | AWS region for DynamoDB and Cognito interactions.    | `us-east-1`         |
| `COGNITO_USER_POOL_ID`    | AWS Cognito User Pool ID (for admin guard).          | `your-user-pool-id` |
| `COGNITO_CLIENT_ID`       | AWS Cognito Client ID (for admin guard).             | `your-client-id`    |
| `COGNITO_ISSUER`          | Cognito Issuer URL for JWT validation.               | `https://cognito-idp.{region}.amazonaws.com/{userPoolId}` |
| `COGNITO_JWKS_URI`        | Cognito JWKS URI for JWT validation.                 | `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json` |

## Local Setup Instructions

To set up and run the User Management Service locally, follow these steps:

1.  **Prerequisites:**
    *   Node.js (v20 or higher recommended)
    *   pnpm (v8 or higher recommended)
    *   Docker and Docker Compose

2.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd user-management-service
    ```

3.  **Install Dependencies:**
    ```bash
    pnpm install
    ```

4.  **Environment Configuration:**
    Create a `.env` file in the root of the `user-management-service` directory by copying `.env.example` and filling in the appropriate values.
    ```bash
    cp .env.example .env
    # Edit .env with your specific AWS credentials and Cognito details
    ```

5.  **Run with Docker Compose (Recommended for local development):**
    The `docker-compose.yml` in the project root orchestrates all services, including local DynamoDB.
    Navigate to the project root (`E:\NodeJS\PBAC_Auth`) and run:
    ```bash
    docker compose up -d dynamodb-local
    ```
    Then, from the `user-management-service` directory, start the service in development mode:
    ```bash
    pnpm run dev
    ```

6.  **Build and Run (Production-like):**
    ```bash
    pnpm run build
    pnpm run start
    ```

7.  **Running Tests:**
    ```bash
    pnpm test
    ```
