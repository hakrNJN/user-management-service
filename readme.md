# User Management Microservice (Admin)

## Overview

This microservice provides administrative functionalities for managing users, identity provider (IdP) groups, application-defined roles, permissions, and authorization policies. It acts as a central hub for defining the assets used by a separate runtime Authorization Service to make access control decisions.

The service is designed with flexibility in mind, allowing the management of components necessary for implementing Role-Based Access Control (RBAC), Attribute-Based Access Control (ABAC), and Policy-Based Access Control (PBAC).

## Core Functionality

*   **User Management:** Create, read, update, delete, enable/disable users within the configured Identity Provider (currently AWS Cognito).
*   **Group Management:** Create, read, delete IdP groups (e.g., Cognito Groups) and manage user membership within these groups.
*   **Role Management:** Define application-specific roles (stored in the database).
*   **Permission Management:** Define fine-grained permissions (stored in the database).
*   **Assignment Management:** Manage relationships between Users, Groups, Roles, and Permissions (e.g., assign roles to groups, assign permissions to roles).
*   **Policy Management:** Create, read, update, delete authorization policies (e.g., OPA Rego policies) via a pluggable policy engine adapter.
*   **System:** Provides basic health checks and server information endpoints.

**Note:** This service focuses on the *management* of authorization assets. The *enforcement* of these roles, permissions, and policies at runtime is handled by a separate Authorization Service which consumes the data managed here.

## Architecture

This service follows principles inspired by **Clean Architecture / Hexagonal Architecture**, emphasizing a separation of concerns through distinct layers:

*   **`src/domain`:** Contains the core business logic and entities (e.g., `User`, `Group`, `Role`, `Permission`, `Policy`, Value Objects, Domain Exceptions). It has no dependencies on other layers.
*   **`src/application`:** Orchestrates use cases. Contains Application Services, Interfaces (Ports) defining contracts for repositories and external adapters, and DTO structures (though DTOs are often placed closer to the API layer). Depends only on the `domain` layer.
*   **`src/infrastructure`:** Implements interfaces defined in the `application` layer. Handles external concerns like database interactions (DynamoDB Repositories), communication with the IdP (Cognito Adapter), policy engine interactions (Policy Engine Adapter), logging (Winston), configuration loading, etc. Depends on `application` and `domain`.
*   **`src/api`:** Handles incoming HTTP requests (Controllers, Routes, Middleware, DTOs/Validation Schemas). Interacts with the `application` layer services. Depends on `application` and `domain`.
*   **`src/shared`:** Contains cross-cutting concerns like constants, base error classes, shared types, and utility functions used across multiple layers.

This layered approach promotes:
*   **Modularity:** Changes in one layer (e.g., swapping the database) have minimal impact on others.
*   **Testability:** Each layer can be tested independently, mocking dependencies via interfaces.
*   **Maintainability:** Clear separation makes the codebase easier to understand and evolve.

The architecture employs the **Ports and Adapters** pattern where application layer interfaces act as "ports" and infrastructure components (like `CognitoUserMgmtAdapter`, `DynamoRoleRepository`, `DynamoDbPolicyEngineAdapter`) act as "adapters".

## Key Design Patterns & Principles

*   **SOLID Principles:** The layered architecture and use of DI promote Single Responsibility, Open/Closed Principle, and Dependency Inversion.
*   **Dependency Injection (DI):** `tsyringe` is used heavily to manage dependencies, decoupling components and improving testability. Interfaces are defined in `application` and injected into services and adapters.
*   **Repository Pattern:** Abstracts data persistence logic behind interfaces (`IRoleRepository`, `IPermissionRepository`, `IPolicyRepository`, `IAssignmentRepository`). DynamoDB implementations are provided in `infrastructure`.
*   **Adapter Pattern:** Used to abstract interactions with external systems like AWS Cognito (`IUserMgmtAdapter`) and the policy management backend (`IPolicyEngineAdapter`).
*   **Middleware Pattern:** Leveraged extensively in Express for concerns like authentication (`admin.auth.guard`), validation (`validation.middleware`), logging (`requestLogger`), request ID generation, error handling, security headers (`helmet`), and CORS.
*   **Data Transfer Object (DTO) Pattern:** Zod schemas defined in `src/api/dtos` act as DTOs, providing type safety and runtime validation for API request bodies, query parameters, and route parameters via the `validationMiddleware`.
*   **Factory Pattern:** Static methods like `fromPersistence` and `fromCognitoUser` on domain entities act as simple factories for object creation from different data sources.
*   **Circuit Breaker Pattern:** `Opossum` is used in the `CognitoUserMgmtAdapter` to improve resilience against failures or latency when communicating with AWS Cognito.
*   **Separation of Concerns:** Enforced by the layered architecture.
*   **Structured Logging:** Winston is used for logging, with distinct development/production formats and context propagation (Request ID, User ID) via `AsyncLocalStorage`.
*   **Configuration Management:** Centralized configuration loading from environment variables via `EnvironmentConfigService`, injected via DI.

## Project Structure

```
└── 📁src
├── 📁api # Handles HTTP layer: Controllers, Routes, DTOs, Middleware
├── 📁application # Application logic: Services, Interfaces (Ports)
├── 📁domain # Core business logic: Entities, Value Objects, Domain Exceptions
├── 📁infrastructure # Implementations: Adapters, DB Repos, Logging, Config
├── 📁shared # Cross-cutting concerns: Constants, Base Errors, Utils, Shared Types
├── app.ts # Express application setup
├── container.ts # Dependency Injection container setup (tsyringe)
└── main.ts # Application entry point, bootstrapping
└── 📁tests # Unit, Integration, and E2E tests
├── 📁e2e
├── 📁helpers # Test helpers (e.g., DB setup)
├── 📁integration # Integration tests (DB, Routes, Adapters)
├── 📁mocks # Reusable mocks for services, repos, etc.
└── 📁unit # Unit tests per layer/module
└── .env.example # Example environment file
└── Dockerfile # (If containerization is used)
└── docker-compose.yml # (For local development/testing with dependencies like DynamoDB Local)
└── package.json
└── tsconfig.json
└── README.md
```

## Technology Stack

*   **Runtime:** Node.js (v18+ recommended)
*   **Language:** TypeScript
*   **Framework:** Express
*   **Dependency Injection:** `tsyringe`
*   **Database:** AWS DynamoDB (`@aws-sdk/client-dynamodb`, `@aws-sdk/util-dynamodb`, `@aws-sdk/lib-dynamodb`)
*   **Identity Provider:** AWS Cognito (`@aws-sdk/client-cognito-identity-provider`)
*   **Validation:** Zod
*   **Logging:** Winston, `winston-cloudwatch` (for production)
*   **Resilience:** Opossum (Circuit Breaker)
*   **Security:** Helmet, CORS
*   **Auth/JWT:** `jsonwebtoken`, `jwks-rsa`
*   **Testing:** Jest, Supertest, `aws-sdk-client-mock`, `jest-mock-extended`
*   **Utilities:** `uuid`, `reflect-metadata`
*   **Package Manager:** pnpm

## Setup & Installation

**Prerequisites:**

*   Node.js (>= v18.x recommended)
*   pnpm (>= v9.x recommended)
*   AWS Account & AWS CLI configured (with credentials for accessing Cognito and DynamoDB, preferably via IAM roles/profiles for deployed environments)
*   (Optional) Docker & Docker Compose (for running DynamoDB Local)

**Steps:**

1.  **Clone Repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```
2.  **Install Dependencies:**
    ```bash
    pnpm install
    ```
3.  **Configure Environment:**
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file and provide necessary values for your environment (AWS Region, Cognito Pool ID/Client ID, DynamoDB table name, etc.). See the [Configuration](#configuration) section below for required variables.

## Running the Service

*   **Development:**
    *   Uses `ts-node-dev` for automatic restarts on file changes.
    *   Loads environment variables from `.env` using the `--env-file` flag.
    *   (Optional) Start DynamoDB Local if using it for development: `docker-compose up -d dynamodb-local` (assuming service name in `docker-compose.yml`)
    ```bash
    pnpm dev
    ```
*   **Build for Production:**
    *   Compiles TypeScript to JavaScript in the `dist` folder.
    ```bash
    pnpm build
    ```
*   **Production:**
    *   Runs the compiled JavaScript code from the `dist` folder.
    *   Ensure production environment variables are set (e.g., via system environment, `.env` file passed at runtime, or platform configuration).
    ```bash
    node dist/main.js
    ```
*   **Docker (Example):**
    *   Build the image: `docker-compose build app` (replace `app` with your service name in `docker-compose.yml`)
    *   Run with dependencies: `docker-compose up`

## Running Tests

*   **Run all tests (Unit + Integration):**
    *   Ensure DynamoDB Local is running if integration tests require it: `docker-compose up -d dynamodb-local`
    *   Ensure necessary test environment variables are set (see `tests/jest.setup.ts`).
    ```bash
    pnpm test
    ```
*   **Run tests in watch mode:**
    ```bash
    pnpm test:watch
    ```
*   **Generate coverage report:**
    ```bash
    pnpm test:coverage
    ```
*   **Cognito Integration Tests:** These tests interact with a real AWS Cognito pool and are skipped by default. To enable them:
    1.  Ensure you have a dedicated **TEST Cognito User Pool**.
    2.  Configure AWS credentials with **admin permissions** for that pool in your test environment.
    3.  Set the environment variable `RUN_COGNITO_INTEGRATION_TESTS=true`.
    ```bash
    RUN_COGNITO_INTEGRATION_TESTS=true pnpm test tests/integration/Adapter/CognitoUserMgmtAdapter.integration.spec.ts
    ```
    **Warning:** Running these tests creates and deletes real AWS resources. Use with caution.

## Configuration

The service uses environment variables for configuration, managed by `src/infrastructure/config/EnvironmentConfigService.ts`. Create a `.env` file (or set system environment variables) based on `.env.example`.

**Required Environment Variables:**

*   `NODE_ENV`: Environment (e.g., `development`, `test`, `production`)
*   `PORT`: Port the service listens on (e.g., `3000`)
*   `LOG_LEVEL`: Logging level (e.g., `info`, `debug`, `warn`, `error`)
*   `AWS_REGION`: AWS region for Cognito and DynamoDB (e.g., `us-east-1`)
*   `COGNITO_USER_POOL_ID`: Your AWS Cognito User Pool ID.
*   `COGNITO_CLIENT_ID`: Your AWS Cognito User Pool Client ID (used for token audience validation).
*   `COGNITO_ISSUER`: Issuer URL for Cognito tokens (e.g., `https://cognito-idp.<region>.amazonaws.com/<pool_id>`).
*   `COGNITO_JWKS_URI`: JWKS URL for Cognito tokens (e.g., `https://cognito-idp.<region>.amazonaws.com/<pool_id>/.well-known/jwks.json`).
*   `AUTHZ_TABLE_NAME`: Name of the DynamoDB table used for storing roles, permissions, policies, and assignments.

**Optional/Test-Specific Variables:**

*   `CORS_ORIGIN`: Allowed origin for CORS requests (defaults to `*` in development, **should be restricted in production**).
*   `DYNAMODB_ENDPOINT_URL`: URL for DynamoDB Local (e.g., `http://localhost:8000`).
*   `CW_LOG_GROUP_NAME`: CloudWatch Log Group Name (for production logging).
*   `CW_LOG_STREAM_NAME`: CloudWatch Log Stream Name (for production logging).
*   `TEST_AUTH_BYPASS_ENABLED`: Set to `true` **only in non-production environments** to enable the test authentication bypass token (see `admin.auth.guard.middleware.ts`).

## API Documentation

[TODO: Add link to Swagger/OpenAPI documentation if generated, or refer developers to the `src/api/routes` and `src/api/dtos` directories for endpoint definitions and request/response schemas.]

Example: API endpoints are defined under `src/api/routes`. Refer to the corresponding DTO files in `src/api/dtos` for request validation schemas.

## Deployment

[TODO: Add notes specific to deploying this service, e.g., Serverless Framework configuration, container deployment steps (ECS/EKS), required IAM permissions for the service role.]

## License

[TODO: Specify the license, e.g., MIT, Apache 2.0]
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END

Remember to fill in the [TODO: ...] sections with specifics about your API documentation strategy, deployment details, and license.