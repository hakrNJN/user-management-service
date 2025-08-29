import { Request, Response, NextFunction } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { addRequestId } from '../../../../src/api/middlewares/requestId.middleware';
import { v4 as uuidv4 } from 'uuid';

jest.mock('uuid', () => ({
    v4: jest.fn(),
}));

describe('addRequestId Middleware', () => {
    let req: MockProxy<Request>;
    let res: MockProxy<Response>;
    let next: jest.Mock;

    beforeEach(() => {
        req = mock<Request>();
        res = mock<Response>();
        next = jest.fn();

        // Mock res.setHeader to allow chaining
        res.setHeader.mockReturnThis();

        // Clear mock for uuidv4 before each test
        (uuidv4 as jest.Mock).mockClear();
    });

    it('should generate a unique ID, attach it to req, set response header, and call next', () => {
        const mockUuid = 'mock-uuid-123';
        (uuidv4 as jest.Mock).mockReturnValue(mockUuid);

        addRequestId(req, res, next);

        expect(uuidv4).toHaveBeenCalledTimes(1);
        expect(req.id).toBe(mockUuid);
        expect(res.setHeader).toHaveBeenCalledTimes(1);
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', mockUuid);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith();
    });
});