import { JwtValidator } from '@src/shared/utils/jwtValidator';

describe('JwtValidator', () => {
    let validator: JwtValidator;

    beforeEach(() => {
        validator = new JwtValidator();
    });

    it('should return decoded payload for a valid token', () => {
        const result = validator.validate('valid_token');
        expect(result).toEqual({ id: 'mock_user_id', username: 'mock_username' });
    });

    it('should throw an error for an invalid token', () => {
        expect(() => validator.validate('bad_token')).toThrow('Invalid token');
    });

    it('should throw an error for an empty string', () => {
        expect(() => validator.validate('')).toThrow('Invalid token');
    });
});
