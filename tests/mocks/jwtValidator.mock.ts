import { mock, MockProxy } from 'jest-mock-extended';
import { JwtValidator } from '../../src/shared/utils/jwtValidator';

export const mockJwtValidator: MockProxy<JwtValidator> = mock<JwtValidator>();

// This mock class can be used if tsyringe needs a class to instantiate,
// but its constructor will return the single mockJwtValidator instance.
export class MockJwtValidatorClass extends JwtValidator {
    constructor() {
        super();
        return mockJwtValidator;
    }
}
