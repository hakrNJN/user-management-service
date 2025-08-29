export class JwtValidator {
    validate(token: string): any {
        // Placeholder implementation
        if (token === 'valid_token') {
            return { id: 'mock_user_id', username: 'mock_username' };
        }
        throw new Error('Invalid token');
    }
}