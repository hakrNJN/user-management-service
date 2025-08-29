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

    beforeAll(() => {
        app = createApp(); // Initialize app here
    });

    const username = `test-user-${Date.now()}`;
    const userDetails = {
        username,
        email: `${username}@example.com`,
        temporaryPassword: 'Password123!',
    };

    const cognitoUser: UserType = {
        Username: username,
        Attributes: [
            { Name: 'sub', Value: 'uuid-for-user' },
            { Name: 'email', Value: userDetails.email },
        ],
        Enabled: true,
        UserStatus: UserStatusType.CONFIRMED,
        UserCreateDate: new Date(),
        UserLastModifiedDate: new Date(),
    };

    it('should create a new user', async () => {
        userMgmtAdapterMock.adminCreateUser.mockResolvedValue(cognitoUser);

        const response = await request(app)
            .post('/admin/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(userDetails)
            .expect(201);

        expect(response.body.username).toBe(username);
        expect(userMgmtAdapterMock.adminCreateUser).toHaveBeenCalledWith(userDetails);
    });

    it('should get the created user', async () => {
        userMgmtAdapterMock.adminGetUser.mockResolvedValue(cognitoUser);
        userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue({ groups: [] as GroupType[] });

        const response = await request(app)
            .get(`/admin/users/${username}`)
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
            .patch(`/admin/users/${username}/attributes`)
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
            .post(`/admin/users/${username}/groups`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ groupName })
            .expect(204);
        
        expect(userMgmtAdapterMock.adminAddUserToGroup).toHaveBeenCalledWith(username, groupName);
    });

    it('should list the user\'s groups', async () => {
        const groups = { groups: [{ GroupName: groupName, Description: 'test', CreationDate: new Date(), LastModifiedDate: new Date(), UserPoolId: 'test-pool' }] as GroupType[] };
        userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue(groups);

        const response = await request(app)
            .get(`/admin/users/${username}/groups`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(response.body.groups[0].groupName).toBe(groupName);
        expect(userMgmtAdapterMock.adminListGroupsForUser).toHaveBeenCalledWith(username, undefined, undefined);
    });

    it('should remove the user from the group', async () => {
        userMgmtAdapterMock.adminRemoveUserFromGroup.mockResolvedValue();

        await request(app)
            .delete(`/admin/users/${username}/groups/${groupName}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminRemoveUserFromGroup).toHaveBeenCalledWith(username, groupName);
    });

    it('should disable the user', async () => {
        userMgmtAdapterMock.adminDisableUser.mockResolvedValue();

        await request(app)
            .post(`/admin/users/${username}/disable`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminDisableUser).toHaveBeenCalledWith(username);
    });

    it('should enable the user', async () => {
        userMgmtAdapterMock.adminEnableUser.mockResolvedValue();

        await request(app)
            .post(`/admin/users/${username}/enable`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminEnableUser).toHaveBeenCalledWith(username);
    });

    it('should delete the user', async () => {
        userMgmtAdapterMock.adminDeleteUser.mockResolvedValue();

        await request(app)
            .delete(`/admin/users/${username}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminDeleteUser).toHaveBeenCalledWith(username);
    });
});