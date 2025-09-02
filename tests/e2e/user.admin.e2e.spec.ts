import './setup'; // This will import the mocks and register them in the container
import request from 'supertest';
import { createApp } from '../../src/app'; // Import createApp function
import { userMgmtAdapterMock, assignmentRepositoryMock, roleRepositoryMock, permissionRepositoryMock } from './setup';
import { AdminUserView } from '../../src/domain/entities/AdminUserView';
import { Group } from '../../src/domain/entities/Group';
import { Express } from 'express';
import { UserStatusType, UserType, GroupType } from '@aws-sdk/client-cognito-identity-provider';

describe('User Admin E2E', () => {
    let app: Express; // Declare app variable
    const adminToken = 'dummy-admin-token';
    const BASE_API_PATH = '/api/admin/users';

    beforeAll(() => {
        app = createApp(); // Initialize app here
    });

    const username = `test-user-${Date.now()}`;
    const userDetails = {
        username,
        temporaryPassword: 'Password123!',
        userAttributes: {
            email: `${username}@example.com`,
            name: 'Test User', // Add a name attribute as well
        },
    };

    const cognitoUser: UserType = {
        Username: username,
        Attributes: [
            { Name: 'sub', Value: 'uuid-for-user' },
            { Name: 'email', Value: userDetails.userAttributes.email },
        ],
        Enabled: true,
        UserStatus: UserStatusType.CONFIRMED,
        UserCreateDate: new Date(),
        UserLastModifiedDate: new Date(),
    };

    it('should create a new user', async () => {
        userMgmtAdapterMock.adminCreateUser.mockResolvedValue(cognitoUser);

        const response = await request(app)
            .post(BASE_API_PATH)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ body: userDetails }); // Re-added .expect(201) for now

        if (response.status !== 201) {
            console.log('Response Status:', response.status);
            console.log('Response Body:', response.body);
        }
        expect(response.status).toBe(201); // Added explicit status check
        expect(response.body.username).toBe(username);
        expect(userMgmtAdapterMock.adminCreateUser).toHaveBeenCalledWith(userDetails);
    });

    it('should get the created user', async () => {
        userMgmtAdapterMock.adminGetUser.mockResolvedValue(cognitoUser);
        userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue({ groups: [] as GroupType[] });

        const response = await request(app)
            .get(`${BASE_API_PATH}/${username}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(response.body.username).toBe(username);
        expect(userMgmtAdapterMock.adminGetUser).toHaveBeenCalledWith(username);
    });

    it('should update the user attributes', async () => {
        const attributesToUpdate = {
            attributesToUpdate: {
                'custom:department': 'Engineering'
            }
        };
        userMgmtAdapterMock.adminUpdateUserAttributes.mockResolvedValue();

        await request(app)
            .patch(`${BASE_API_PATH}/${username}/attributes`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send(attributesToUpdate)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminUpdateUserAttributes).toHaveBeenCalledWith({ username, ...attributesToUpdate });
    });

    const groupName = `test-group-${Date.now()}`;
    const groupDetails = { groupName, description: 'A test group' };

    it('should add a user to a group', async () => {
        userMgmtAdapterMock.adminAddUserToGroup.mockResolvedValue();

        await request(app)
            .post(`${BASE_API_PATH}/${username}/groups`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ groupName })
            .expect(204);
        
        expect(userMgmtAdapterMock.adminAddUserToGroup).toHaveBeenCalledWith(username, groupName);
    });

    it('should list the user\'s groups', async () => {
        const groups = { groups: [{ GroupName: groupName, Description: 'test', CreationDate: new Date(), LastModifiedDate: new Date(), UserPoolId: 'test-pool' }] as GroupType[] };
        userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue(groups);

        const response = await request(app)
            .get(`${BASE_API_PATH}/${username}/groups`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(response.body.groups[0].groupName).toBe(groupName);
        expect(userMgmtAdapterMock.adminListGroupsForUser).toHaveBeenCalledWith(username, undefined, undefined);
    });

    it('should remove the user from the group', async () => {
        userMgmtAdapterMock.adminRemoveUserFromGroup.mockResolvedValue();

        await request(app)
            .delete(`${BASE_API_PATH}/${username}/groups/${groupName}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminRemoveUserFromGroup).toHaveBeenCalledWith(username, groupName);
    });

    it('should disable the user', async () => {
        userMgmtAdapterMock.adminDisableUser.mockResolvedValue();

        await request(app) 
            .post(`${BASE_API_PATH}/${username}/disable`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminDisableUser).toHaveBeenCalledWith(username);
    });

    it('should enable the user', async () => {
        userMgmtAdapterMock.adminEnableUser.mockResolvedValue();

        await request(app)
            .post(`${BASE_API_PATH}/${username}/enable`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminEnableUser).toHaveBeenCalledWith(username);
    });

    it('should delete the user', async () => {
        userMgmtAdapterMock.adminDeleteUser.mockResolvedValue();

        await request(app)
            .delete(`${BASE_API_PATH}/${username}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminDeleteUser).toHaveBeenCalledWith(username);
    });
});