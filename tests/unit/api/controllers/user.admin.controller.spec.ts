import { Request, Response, NextFunction } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { UserAdminController } from '../../../../src/api/controllers/user.admin.controller';
import { UserAdminService } from '../../../../src/application/services/user.admin.service';
// Import necessary DTOs, Entities, and Custom Errors (adjust paths as needed)
import { CreateUserDto, UpdateUserDto, User, UserNotFoundError, UserAlreadyExistsError } from '../../../../src/application/services/_mocks'; // Assuming mocks/types are accessible

describe('UserAdminController', () => {
    let controller: UserAdminController;
    let mockUserAdminService: MockProxy<UserAdminService>;
    let mockRequest: MockProxy<Request>;
    let mockResponse: MockProxy<Response>;
    let mockNext: MockProxy<NextFunction>;

    // Mock data (reuse or define as needed)
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
        mockRequest = mock<Request>();
        mockResponse = mock<Response>();
        mockNext = jest.fn() as NextFunction; // Simple mock function for next

        // Crucial for chaining res.status().json() etc.
        mockResponse.status.mockReturnThis();
        mockResponse.json.mockReturnThis();
        mockResponse.send.mockReturnThis(); // For methods like delete that might just send()

        // Instantiate the controller with the mocked service
        controller = new UserAdminController(mockUserAdminService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    // --- Test getAllUsers ---
    describe('getAllUsers', () => {
        it('should call service.getAllUsers and return 200 with users array', async () => {
            // Arrange
            mockUserAdminService.getAllUsers.mockResolvedValue(MOCK_USER_ARRAY);
            // Mock query params if your controller uses them
            mockRequest.query = { limit: '10', offset: '0' };

            // Act
            await controller.getAllUsers(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.getAllUsers).toHaveBeenCalledWith({ limit: 10, offset: 0 }); // Ensure params are parsed correctly if applicable
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(MOCK_USER_ARRAY);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with error if service throws an error', async () => {
            // Arrange
            const serviceError = new Error('Service failure');
            mockUserAdminService.getAllUsers.mockRejectedValue(serviceError);

            // Act
            await controller.getAllUsers(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.getAllUsers).toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });
    });

    // --- Test getUserById ---
    describe('getUserById', () => {
        beforeEach(() => {
            // Set common parameter for these tests
            mockRequest.params = { id: MOCK_USER_ID };
        });

        it('should call service.getUserById and return 200 with the user', async () => {
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
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });

         it('should call next with generic error if service throws other error', async () => {
            // Arrange
            const serviceError = new Error('Database connection failed');
            mockUserAdminService.getUserById.mockRejectedValue(serviceError);

            // Act
            await controller.getUserById(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.getUserById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });
    });

    // --- Test createUser ---
    describe('createUser', () => {
         beforeEach(() => {
            // Set common body for these tests
            mockRequest.body = MOCK_CREATE_DTO;
        });

        it('should call service.createUser and return 201 with the created user', async () => {
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
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });

        // Add test for validation errors if the controller handles them,
        // otherwise assume middleware handles validation before the controller.

        it('should call next with generic error if service throws other error', async () => {
            // Arrange
            const serviceError = new Error('Hashing failed');
            mockUserAdminService.createUser.mockRejectedValue(serviceError);

            // Act
            await controller.createUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.createUser).toHaveBeenCalledWith(MOCK_CREATE_DTO);
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });
    });

    // --- Test updateUser ---
    describe('updateUser', () => {
        beforeEach(() => {
            // Set common params and body for these tests
            mockRequest.params = { id: MOCK_USER_ID };
            mockRequest.body = MOCK_UPDATE_DTO;
        });

        it('should call service.updateUser and return 200 with the updated user', async () => {
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
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });

        it('should call next with generic error if service throws other error', async () => {
            // Arrange
            const serviceError = new Error('Update conflict');
            mockUserAdminService.updateUser.mockRejectedValue(serviceError);

            // Act
            await controller.updateUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.updateUser).toHaveBeenCalledWith(MOCK_USER_ID, MOCK_UPDATE_DTO);
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });
    });

    // --- Test deleteUser ---
    describe('deleteUser', () => {
         beforeEach(() => {
            // Set common parameter for these tests
            mockRequest.params = { id: MOCK_USER_ID };
        });

        it('should call service.deleteUser and return 204 No Content', async () => {
            // Arrange
            mockUserAdminService.deleteUser.mockResolvedValue(undefined); // delete often returns void

            // Act
            await controller.deleteUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockResponse.status).toHaveBeenCalledWith(204);
            expect(mockResponse.send).toHaveBeenCalled(); // Check send() was called for 204
            expect(mockResponse.json).not.toHaveBeenCalled();
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
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.send).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });

        it('should call next with generic error if service throws other error', async () => {
            // Arrange
            const serviceError = new Error('Deletion constraint violation');
            mockUserAdminService.deleteUser.mockRejectedValue(serviceError);

            // Act
            await controller.deleteUser(mockRequest, mockResponse, mockNext);

            // Assert
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.send).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledWith(serviceError);
        });
    });
});
