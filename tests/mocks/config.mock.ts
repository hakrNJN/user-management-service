
import { IConfigService } from '../../src/application/interfaces/IConfigService';
import { mock, MockProxy } from 'jest-mock-extended';

export const mockConfigService: MockProxy<IConfigService> = mock<IConfigService>();

(mockConfigService.get as jest.Mock<any, any>).mockImplementation((key: string, defaultValue?: any) => {
    switch (key) {
        case 'NODE_ENV': return 'test';
        case 'CORS_ORIGIN': return '*'
        case 'DYNAMODB_ENDPOINT_URL': return process.env.DYNAMODB_ENDPOINT_URL || "http://localhost:8000";
        case 'AWS_REGION': return "us-east-1";
        default: return defaultValue;
    }
});

(mockConfigService.getOrThrow as jest.Mock<any, any>).mockImplementation((key: string) => {
    switch (key) {
        case 'AUTHZ_TABLE_NAME': return 'TestAuthzTable';
        case 'AWS_ACCESS_KEY_ID': return 'test';
        case 'AWS_SECRET_ACCESS_KEY': return 'test';
        default: throw new Error(`Config key ${key} not mocked and has no default.`);
    }
});
