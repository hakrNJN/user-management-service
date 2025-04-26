import { Request, Response, NextFunction } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { UserAdminController } from '../../../../src/api/controllers/user.admin.controller';
import { UserAdminService } from '../../../../src/application/services/user.admin.service';
// Import necessary DTOs, Entities, and Custom Errors (adjust paths as needed)
// Using placeholders from previous examples
import {
    CreateUserDto,
    UpdateUserDto,
    User,
    UserNotFoundError,
    UserAlreadyExistsError,
    InvalidPasswordError, // Added for variety
} from '../../../../src/application/services/_mocks';

describe('UserAdminController', () => {
    let controller: UserAdminController;
    let mockUserAdminService: MockProxy<UserAdminService>;
    let mockRequest: MockProxy<Request>;
    let mockResponse: MockProxy<Response>;
    let mockNext: MockProxy<NextFunction>;

    // Mock data
    const MOCK_USER_ID = 'user-123';
    const MOCK_USER_EMAIL = 'test@example.com';
    const MOCK_USER: User = {
        id: MOCK_USER_ID,
        email: MOCK_USER_EMAIL,
        passwordHash: 'hashed_password_abc',
        firstName: 'Test',
        lastName: 'User',
        roles: ['user'],
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const MOCK_USER_ARRAY = [MOCK_USER, { ...MOCK_USER, id: 'user-456', email: 'another@example.com' }];
    const MOCK_CREATE_DTO: CreateUserDto = {
        email: 'new@example.com',
        password: 'Password123!',
        firstName: 'New',
        lastName: 'User',
        roles: ['admin'],
    };
     const MOCK_UPDATE_DTO: UpdateUserDto = {
        firstName: 'UpdatedFirst',
        lastName: 'UpdatedLast',
    };

    beforeEach(() => {
        // Create fresh mocks for each test
        mockUserAdminService = mock<UserAdminService>();
        // Mock Express objects with specific types
        mockRequest = mock<Request>({
            params: {}, // Initialize common properties
            query: {},
            body: {},
        });
        mockResponse = mock<Response>();
        mockNext = jest.fn() as NextFunction;

        // Setup mockResponse chaining
        mockResponse.status.mockReturnThis();
        mockResponse.json.mockReturnThis();
        mockResponse.send.mockReturnThis();

        // Instantiate the controller
        controller = new UserAdminController(mockUserAdminService);
    });

    // --- Test getAllUsers ---
    describe('getAllUsers', () => {
        it('should call service.getAllUsers with parsed query params and return 200 with users', async () => {
            // Arrange
            mockUserAdminService.getAllUsers.mockResolvedValue(MOCK_USER_ARRAY);
            mockRequest.query = { limit: '20', offset: '5', sortBy: 'email' }; // Example query params as strings

            // Act
            await controller.getAllUsers(mockRequest, mockResponse, mockNext);

            // Assert
            // Verify that the controller correctly parses/passes query params (adjust based on controller logic)
            expect(mockUserAdminService.getAllUsers).toHaveBeenCalledWith({
                limit: 20, // Assuming controller parses to number
                offset: 5,  // Assuming controller parses to number
                sortBy: 'email'
            });
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(MOCK_USER_ARRAY);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call service.getAllUsers with default options if no query params provided', async () => {
            // Arrange
            mockUserAdminService.getAllUsers.mockResolvedValue(MOCK_USER_ARRAY);
            mockRequest.query = {}; // No query params

            // Act
            await controller.getAllUsers(mockRequest, mockResponse, mockNext);

            // Assert
            // Check if service is called with undefined or specific default options
            expect(mockUserAdminService.getAllUsers).toHaveBeenCalledWith({}); // Or match specific defaults if controller sets them
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(MOCK_USER_ARRAY);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with error if service throws an error', async () => {
            // Arrange
            const serviceError = new Error('Database unavailable');
            mockUserAdminService.getAllUsers.mockRejectedValue(serviceError);

            // Act
            await controller.getAllUsers(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.getAllUsers).toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError); // Verify the exact error is passed
        });
    });

    // --- Test getUserById ---
    describe('getUserById', () => {
        beforeEach(() => {
            mockRequest.params = { id: MOCK_USER_ID };
        });

        it('should call service.getUserById with id from params and return 200 with user', async () => {
            // Arrange
            mockUserAdminService.getUserById.mockResolvedValue(MOCK_USER);

            // Act
            await controller.getUserById(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.getUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(MOCK_USER);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with UserNotFoundError if service throws UserNotFoundError', async () => {
            // Arrange
            const serviceError = new UserNotFoundError(MOCK_USER_ID);
            mockUserAdminService.getUserById.mockRejectedValue(serviceError);

            // Act
            await controller.getUserById(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.getUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockNext).toHaveBeenCalledWith(serviceError); // Pass the specific error instance
        });

        // Test case assuming ID parameter is missing (might be caught by routing/middleware in reality)
        // it('should call next with an error if id parameter is missing', async () => {
        //     // Arrange
        //     mockRequest.params = {}; // No ID
        //
        //     // Act
        //     await controller.getUserById(mockRequest, mockResponse, mockNext);
        //
        //     // Assert
        //     // Depending on implementation, might throw directly or call next
        //     expect(mockUserAdminService.getUserById).not.toHaveBeenCalled();
        //     expect(mockNext).toHaveBeenCalledWith(expect.any(Error)); // Expect some error
        // });
    });

    // --- Test createUser ---
    describe('createUser', () => {
         beforeEach(() => {
            mockRequest.body = MOCK_CREATE_DTO;
        });

        it('should call service.createUser with body DTO and return 201 with created user', async () => {
            // Arrange
            const createdUser = { ...MOCK_USER, ...MOCK_CREATE_DTO, id: 'new-user-id-xyz' };
            mockUserAdminService.createUser.mockResolvedValue(createdUser);

            // Act
            await controller.createUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.createUser).toHaveBeenCalledWith(MOCK_CREATE_DTO);
            expect(mockResponse.status).toHaveBeenCalledWith(201);
            expect(mockResponse.json).toHaveBeenCalledWith(createdUser);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with UserAlreadyExistsError if service throws UserAlreadyExistsError', async () => {
            // Arrange
            const serviceError = new UserAlreadyExistsError(MOCK_CREATE_DTO.email);
            mockUserAdminService.createUser.mockRejectedValue(serviceError);

            // Act
            await controller.createUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.createUser).toHaveBeenCalledWith(MOCK_CREATE_DTO);
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });

        it('should call next with InvalidPasswordError if service throws InvalidPasswordError', async () => {
            // Arrange
            // This might happen if the service validates password complexity *after* hashing attempt or similar
            const serviceError = new InvalidPasswordError();
            mockUserAdminService.createUser.mockRejectedValue(serviceError);

            // Act
            await controller.createUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.createUser).toHaveBeenCalledWith(MOCK_CREATE_DTO);
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });

        // Test case assuming body is missing (might be caught by middleware)
        // it('should call next with an error if request body is missing', async () => {
        //     // Arrange
        //     mockRequest.body = undefined;
        //
        //     // Act
        //     await controller.createUser(mockRequest, mockResponse, mockNext);
        //
        //     // Assert
        //     expect(mockUserAdminService.createUser).not.toHaveBeenCalled();
        //     expect(mockNext).toHaveBeenCalledWith(expect.any(Error)); // Expect some error
        // });
    });

    // --- Test updateUser ---
    describe('updateUser', () => {
        beforeEach(() => {
            mockRequest.params = { id: MOCK_USER_ID };
            mockRequest.body = MOCK_UPDATE_DTO;
        });

        it('should call service.updateUser with id and DTO, return 200 with updated user', async () => {
            // Arrange
            const updatedUser = { ...MOCK_USER, ...MOCK_UPDATE_DTO, updatedAt: new Date() };
            mockUserAdminService.updateUser.mockResolvedValue(updatedUser);

            // Act
            await controller.updateUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.updateUser).toHaveBeenCalledWith(MOCK_USER_ID, MOCK_UPDATE_DTO);
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(updatedUser);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with UserNotFoundError if service throws UserNotFoundError', async () => {
            // Arrange
            const serviceError = new UserNotFoundError(MOCK_USER_ID);
            mockUserAdminService.updateUser.mockRejectedValue(serviceError);

            // Act
            await controller.updateUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.updateUser).toHaveBeenCalledWith(MOCK_USER_ID, MOCK_UPDATE_DTO);
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });
    });

    // --- Test deleteUser ---
    describe('deleteUser', () => {
         beforeEach(() => {
            mockRequest.params = { id: MOCK_USER_ID };
        });

        it('should call service.deleteUser with id and return 204', async () => {
            // Arrange
            mockUserAdminService.deleteUser.mockResolvedValue(undefined); // Assuming void return

            // Act
            await controller.deleteUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockResponse.status).toHaveBeenCalledWith(204);
            expect(mockResponse.send).toHaveBeenCalled(); // Check send() for 204
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with UserNotFoundError if service throws UserNotFoundError', async () => {
            // Arrange
            const serviceError = new UserNotFoundError(MOCK_USER_ID);
            mockUserAdminService.deleteUser.mockRejectedValue(serviceError);

            // Act
            await controller.deleteUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });
    });
});
