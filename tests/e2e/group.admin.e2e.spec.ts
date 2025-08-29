
import './setup'; // This will import the mocks and register them in the container
import request from 'supertest';
import { createApp } from '../../src/app'; // Import createApp function
import { userMgmtAdapterMock, assignmentRepositoryMock, roleRepositoryMock } from './setup';
import { Group } from '../../src/domain/entities/Group';
import { Role } from '../../src/domain/entities/Role';
import { Express } from 'express';

describe('Group Admin E2E', () => {
    let app: Express; // Declare app variable
    const adminToken = 'dummy-admin-token';

    beforeAll(() => {
        app = createApp(); // Initialize app here
    });

    const groupName = `test-group-${Date.now()}`;
    const groupDetails = {
        groupName,
        description: 'A test group for e2e tests',
    };

    const cognitoGroup = {
        GroupName: groupName,
        Description: groupDetails.description,
        UserPoolId: 'test-pool-id',
        LastModifiedDate: new Date(),
        CreationDate: new Date(),
    };

    const roleName = `test-role-for-group-${Date.now()}`;
    const roleEntity = new Role(roleName, 'A test role');

    it('should create a new group', async () => {
        userMgmtAdapterMock.adminCreateGroup.mockResolvedValue(cognitoGroup);

        const response = await request(app)
            .post('/admin/groups')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(groupDetails)
            .expect(201);

        expect(response.body.groupName).toBe(groupName);
        expect(userMgmtAdapterMock.adminCreateGroup).toHaveBeenCalledWith(groupDetails);
    });

    it('should get the created group', async () => {
        userMgmtAdapterMock.adminGetGroup.mockResolvedValue(cognitoGroup);

        const response = await request(app)
            .get(`/admin/groups/${groupName}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(response.body.groupName).toBe(groupName);
        expect(userMgmtAdapterMock.adminGetGroup).toHaveBeenCalledWith(groupName);
    });

    it('should assign a role to the group', async () => {
        userMgmtAdapterMock.adminGetGroup.mockResolvedValue(cognitoGroup);
        roleRepositoryMock.findByName.mockResolvedValue(roleEntity);
        assignmentRepositoryMock.assignRoleToGroup.mockResolvedValue();

        await request(app)
            .post(`/admin/groups/${groupName}/roles`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ roleName })
            .expect(204);
        
        expect(assignmentRepositoryMock.assignRoleToGroup).toHaveBeenCalledWith(groupName, roleName);
    });

    it('should list the roles for the group', async () => {
        userMgmtAdapterMock.adminGetGroup.mockResolvedValue(cognitoGroup);
        assignmentRepositoryMock.findRolesByGroupName.mockResolvedValue([roleName]);

        const response = await request(app)
            .get(`/admin/groups/${groupName}/roles`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(response.body).toContain(roleName);
        expect(assignmentRepositoryMock.findRolesByGroupName).toHaveBeenCalledWith(groupName);
    });

    it('should remove the role from the group', async () => {
        assignmentRepositoryMock.removeRoleFromGroup.mockResolvedValue();

        await request(app)
            .delete(`/admin/groups/${groupName}/roles/${roleName}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(assignmentRepositoryMock.removeRoleFromGroup).toHaveBeenCalledWith(groupName, roleName);
    });

    it('should delete the group', async () => {
        userMgmtAdapterMock.adminDeleteGroup.mockResolvedValue();

        await request(app)
            .delete(`/admin/groups/${groupName}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(204);
        
        expect(userMgmtAdapterMock.adminDeleteGroup).toHaveBeenCalledWith(groupName);
    });
});
