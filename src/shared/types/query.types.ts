export interface QueryOptions {
    limit?: number;
    paginationToken?: string;
    filter?: string;
    startKey?: Record<string, any>; // Add startKey for DynamoDB pagination
    // Add any other common query parameters
}

export interface QueryResult<T> {
    items: T[];
    total?: number; // Optional total count
    paginationToken?: string; // For next page
    lastEvaluatedKey?: Record<string, any>; // Add lastEvaluatedKey for DynamoDB pagination
}