import request from 'supertest';
import { Express } from 'express'; // Import Express type
import { createApp } from '../../src/app'; // Import the factory function
import { HttpStatusCode } from '../../src/application/enums/HttpStatusCode'; // Import for status codes

// --- Mock Data ---
// --- Define the Test Bypass Token ---
const TEST_AUTH_BYPASS_TOKEN = 'valid-test-token-for-admin-bypass-12345'; // Must match the one in the guard
// (Keep the mock data section as it was in the previous correction)
const MOCK_AUTH_HEADER = { Authorization: `Bearer ${TEST_AUTH_BYPASS_TOKEN}` };
const testUsername = `test-user-${Date.now()}@example.com`; // Use email as username, ensure uniqueness
const testPassword = 'Password123!';
const testGroupName = `TestGroup-${Date.now()}`;

const MOCK_NEW_USER_PAYLOAD = {
    username: testUsername, // Assuming CreateUserAdminDto requires username
    temporaryPassword: testPassword,
    userAttributes: {
        email: testUsername, // Often email is also an attribute
        email_verified: 'true',
        given_name: 'Test',
        family_name: 'User',
        'custom:tenantId': 'integ-test-tenant', // Example custom attribute
    },
    // Add other fields required by your CreateUserAdminDto Schema
};

const MOCK_UPDATE_ATTRIBUTES_PAYLOAD = {
    // This payload should match the UpdateUserAttributesAdminSchema BODY
    attributesToUpdate: {
        given_name: 'UpdatedFirstName',
        family_name: 'UpdatedLastName',
        'custom:role': 'tester',
    }
};

const MOCK_SET_PASSWORD_PAYLOAD = {
    password: 'NewSecurePassword456!',
    permanent: true,
};

const MOCK_ADD_GROUP_PAYLOAD = {
    groupName: testGroupName, // Match AddUserToGroupAdminSchema BODY
};



// --- Test Suite ---
describe('User Admin API Integration (/api/admin/users routes)', () => { // Adjust base path if needed
    let app: Express; // Declare app variable
    let createdUsername: string | null = testUsername; // Use the one we plan to create

    // Setup: Create a new app instance before running tests
    beforeAll(() => {
        app = createApp(); // Call the factory to get the app instance
    });

    // Optional: Cleanup after all tests
    afterAll(async () => {
        if (createdUsername) {
             // NOTE: Make sure the API base path '/api' is included here
            await request(app)
                .delete(`/api/admin/users/${createdUsername}`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
        }
         // TODO: Add cleanup for the test group if created
    });

    // --- POST /api/admin/users ---
    describe('POST /api/admin/users', () => {
        it('should return 201 and the created user when payload is valid and authorized', async () => {
             // NOTE: Make sure the API base path '/api' is included here
            const res = await request(app)
                .post('/api/admin/users') // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_NEW_USER_PAYLOAD);

            expect(res.status).toBe(HttpStatusCode.CREATED);
            expect(res.body).toBeDefined();
            expect(res.body.Username).toBe(MOCK_NEW_USER_PAYLOAD.username);
            expect(res.body.UserStatus).toBe('FORCE_CHANGE_PASSWORD');
            expect(res.body.Attributes).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ Name: 'email', Value: MOCK_NEW_USER_PAYLOAD.username }),
                    expect.objectContaining({ Name: 'given_name', Value: MOCK_NEW_USER_PAYLOAD.userAttributes.given_name }),
                    expect.objectContaining({ Name: 'family_name', Value: MOCK_NEW_USER_PAYLOAD.userAttributes.family_name }),
                ])
            );
             createdUsername = res.body.Username; // Store the actually created username
        });

        it('should return 400 Bad Request if payload is invalid (e.g., missing username)', async () => {
            const { username, ...invalidPayload } = MOCK_NEW_USER_PAYLOAD;
            const res = await request(app)
                .post('/api/admin/users') // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload);

            expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
            expect(res.body?.error?.issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ path: ['body', 'username'] })
                ])
            );
        });

        // ... (Keep other POST tests like weak password, unauthorized, duplicate - add /api prefix to paths)
        it('should return 400 Bad Request if password is weak (if policy exists)', async () => {
             const weakPasswordPayload = { ...MOCK_NEW_USER_PAYLOAD, temporaryPassword: '123' };
             const res = await request(app)
                 .post('/api/admin/users') // <<< Added /api prefix
                 .set(MOCK_AUTH_HEADER)
                 .send(weakPasswordPayload);
             expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
         });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            const res = await request(app)
                .post('/api/admin/users') // <<< Added /api prefix
                .send(MOCK_NEW_USER_PAYLOAD);
            expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
        });

        it('should return 400 Bad Request if username already exists', async () => {
             if (!createdUsername || createdUsername !== testUsername) { // Ensure creation was successful
                 console.warn("Skipping duplicate username test as initial creation might have failed or username mismatch.");
                 return;
             }
             const res = await request(app)
                 .post('/api/admin/users') // <<< Added /api prefix
                 .set(MOCK_AUTH_HEADER)
                 .send(MOCK_NEW_USER_PAYLOAD);
            expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
            expect(res.body?.message).toContain('Username already exists');
         });

    });

     // --- GET /api/admin/users ---
     describe('GET /api/admin/users', () => {
        it('should return 200 and a list of users when authorized', async () => {
            const res = await request(app)
                .get('/api/admin/users?limit=5') // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(HttpStatusCode.OK);
            expect(res.body).toHaveProperty('users');
            expect(res.body.users).toBeInstanceOf(Array);
            if (createdUsername && res.body.users.length > 0) {
                expect(res.body.users).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ Username: createdUsername })
                    ])
                );
            }
        });

         // ... (Keep other GET tests like invalid query, unauthorized - add /api prefix to paths)
         it('should return 400 Bad Request if query params are invalid', async () => {
             const res = await request(app)
                .get('/api/admin/users?limit=abc') // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
             expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
             expect(res.body?.error?.issues).toEqual(
                 expect.arrayContaining([
                     expect.objectContaining({ path: ['query', 'limit'] })
                 ])
             );
         });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            const res = await request(app).get('/api/admin/users'); // <<< Added /api prefix
            expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
        });
    });

    // --- GET /api/admin/users/:username ---
    describe('GET /api/admin/users/:username', () => {
        it('should return 200 and the specific user if username exists and authorized', async () => {
            if (!createdUsername) throw new Error('Cannot run GET test, user creation failed previously.');

            const res = await request(app)
                .get(`/api/admin/users/${createdUsername}`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(HttpStatusCode.OK);
            expect(res.body).toBeDefined();
            expect(res.body.Username).toBe(createdUsername);
            expect(res.body.Attributes).toEqual(expect.any(Array));
        });

        // ... (Keep other GET /:username tests - add /api prefix to paths)
         it('should return 404 Not Found if username does not exist', async () => {
            const nonExistentUsername = 'non-existent-user@example.com';
            const res = await request(app)
                .get(`/api/admin/users/${nonExistentUsername}`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
            expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
            expect(res.body?.message).toContain(`User '${nonExistentUsername}' not found`);
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            if (!createdUsername) throw new Error('Cannot run GET unauthorized test, user creation failed previously.');
            const res = await request(app).get(`/api/admin/users/${createdUsername}`); // <<< Added /api prefix
            expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
        });
    });

    // --- PUT /api/admin/users/:username/attributes ---
    describe('PUT /api/admin/users/:username/attributes', () => {
         it('should return 204 No Content if username exists, payload is valid, and authorized', async () => {
            if (!createdUsername) throw new Error('Cannot run PUT test, user creation failed previously.');

            const res = await request(app)
                .put(`/api/admin/users/${createdUsername}/attributes`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD);

            expect(res.status).toBe(HttpStatusCode.NO_CONTENT);

            // Verify the update
            const getRes = await request(app)
                .get(`/api/admin/users/${createdUsername}`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
            expect(getRes.body.Attributes).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ Name: 'given_name', Value: MOCK_UPDATE_ATTRIBUTES_PAYLOAD.attributesToUpdate.given_name }),
                    expect.objectContaining({ Name: 'family_name', Value: MOCK_UPDATE_ATTRIBUTES_PAYLOAD.attributesToUpdate.family_name }),
                    expect.objectContaining({ Name: 'custom:role', Value: MOCK_UPDATE_ATTRIBUTES_PAYLOAD.attributesToUpdate['custom:role'] }),
                ])
            );
        });

        // ... (Keep other PUT tests - add /api prefix to paths)
         it('should return 400 Bad Request if update payload is invalid', async () => {
             if (!createdUsername) throw new Error('Cannot run PUT invalid payload test, user creation failed previously.');
             // Example: sending payload not matching the schema (e.g., missing attributesToUpdate)
             const invalidUpdatePayload = { firstName: 'some value' };

             const res = await request(app)
                 .put(`/api/admin/users/${createdUsername}/attributes`) // <<< Added /api prefix
                 .set(MOCK_AUTH_HEADER)
                 .send(invalidUpdatePayload);

             expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
             expect(res.body?.error?.issues).toEqual(
                 expect.arrayContaining([
                     expect.objectContaining({ path: ['body', 'attributesToUpdate'] }) // Expecting attributesToUpdate to be required/invalid
                 ])
             );
         });

        it('should return 404 Not Found if username does not exist', async () => {
            const nonExistentUsername = 'non-existent-user@example.com';
            const res = await request(app)
                .put(`/api/admin/users/${nonExistentUsername}/attributes`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD);
            expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
             if (!createdUsername) throw new Error('Cannot run PUT unauthorized test, user creation failed previously.');
            const res = await request(app)
                .put(`/api/admin/users/${createdUsername}/attributes`) // <<< Added /api prefix
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD);
            expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
        });
    });

    // --- POST /api/admin/users/:username/disable ---
    describe('POST /api/admin/users/:username/disable', () => {
        // ... (Keep tests, add /api prefix to paths)
        it('should return 200 OK and confirmation message on successful disable', async () => {
            if (!createdUsername) throw new Error('Cannot run disable test, user creation failed previously.');
            const res = await request(app)
                .post(`/api/admin/users/${createdUsername}/disable`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
            expect(res.status).toBe(HttpStatusCode.OK);
            expect(res.body?.message).toContain(`User ${createdUsername} disabled successfully.`);
            // Verify
            const getRes = await request(app).get(`/api/admin/users/${createdUsername}`).set(MOCK_AUTH_HEADER); // <<< Added /api prefix
            expect(getRes.body?.Enabled).toBe(false);
        });
         it('should return 404 Not Found if username does not exist', async () => {
             const res = await request(app).post('/api/admin/users/non-existent@example.com/disable').set(MOCK_AUTH_HEADER); // <<< Added /api prefix
             expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
         });
          it('should return 401 Unauthorized if token missing', async () => {
             if (!createdUsername) throw new Error('Cannot run disable unauthorized test, user creation failed previously.');
             const res = await request(app).post(`/api/admin/users/${createdUsername}/disable`); // <<< Added /api prefix
             expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
         });
    });

     // --- POST /api/admin/users/:username/enable ---
     describe('POST /api/admin/users/:username/enable', () => {
        // ... (Keep tests, add /api prefix to paths)
        it('should return 200 OK and confirmation message on successful enable', async () => {
            if (!createdUsername) throw new Error('Cannot run enable test, user creation failed previously.');
            const res = await request(app)
                .post(`/api/admin/users/${createdUsername}/enable`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
            expect(res.status).toBe(HttpStatusCode.OK);
            expect(res.body?.message).toContain(`User ${createdUsername} enabled successfully.`);
             // Verify
            const getRes = await request(app).get(`/api/admin/users/${createdUsername}`).set(MOCK_AUTH_HEADER); // <<< Added /api prefix
            expect(getRes.body?.Enabled).toBe(true);
        });
         it('should return 404 Not Found if username does not exist', async () => {
             const res = await request(app).post('/api/admin/users/non-existent@example.com/enable').set(MOCK_AUTH_HEADER); // <<< Added /api prefix
             expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
         });
          it('should return 401 Unauthorized if token missing', async () => {
             if (!createdUsername) throw new Error('Cannot run enable unauthorized test, user creation failed previously.');
             const res = await request(app).post(`/api/admin/users/${createdUsername}/enable`); // <<< Added /api prefix
             expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
         });
    });

      // --- POST /api/admin/users/:username/initiate-password-reset ---
      describe('POST /api/admin/users/:username/initiate-password-reset', () => {
        // ... (Keep tests, add /api prefix to paths)
         it('should return 200 OK and confirmation message', async () => {
             if (!createdUsername) throw new Error('Cannot run password reset test, user creation failed previously.');
            const res = await request(app)
                .post(`/api/admin/users/${createdUsername}/initiate-password-reset`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
            expect(res.status).toBe(HttpStatusCode.OK);
            expect(res.body?.message).toContain(`Password reset initiated for user ${createdUsername}.`);
        });
        it('should return 404 Not Found if username does not exist', async () => {
             const res = await request(app).post('/api/admin/users/non-existent@example.com/initiate-password-reset').set(MOCK_AUTH_HEADER); // <<< Added /api prefix
             expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
         });
          it('should return 401 Unauthorized if token missing', async () => {
             if (!createdUsername) throw new Error('Cannot run reset unauthorized test, user creation failed previously.');
             const res = await request(app).post(`/api/admin/users/${createdUsername}/initiate-password-reset`); // <<< Added /api prefix
             expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
         });
    });

    // --- POST /api/admin/users/:username/set-password ---
    describe('POST /api/admin/users/:username/set-password', () => {
        // ... (Keep tests, add /api prefix to paths)
        it('should return 200 OK and confirmation message', async () => {
            if (!createdUsername) throw new Error('Cannot run set password test, user creation failed previously.');
            const res = await request(app)
                .post(`/api/admin/users/${createdUsername}/set-password`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_SET_PASSWORD_PAYLOAD);
            expect(res.status).toBe(HttpStatusCode.OK);
            expect(res.body?.message).toContain(`Password set successfully for user ${createdUsername}.`);
        });
        it('should return 400 Bad Request if password missing in body', async () => {
            if (!createdUsername) throw new Error('Cannot run set password invalid test, user creation failed previously.');
            const res = await request(app)
                .post(`/api/admin/users/${createdUsername}/set-password`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER)
                .send({ permanent: true });
             expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
             expect(res.body?.error?.issues).toEqual(
                 expect.arrayContaining([
                     expect.objectContaining({ path: ['body', 'password'] })
                 ])
             );
        });
         it('should return 404 Not Found if username does not exist', async () => {
             const res = await request(app)
                 .post('/api/admin/users/non-existent@example.com/set-password') // <<< Added /api prefix
                 .set(MOCK_AUTH_HEADER)
                 .send(MOCK_SET_PASSWORD_PAYLOAD);
             expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
         });
          it('should return 401 Unauthorized if token missing', async () => {
             if (!createdUsername) throw new Error('Cannot run set password unauthorized test, user creation failed previously.');
             const res = await request(app)
                 .post(`/api/admin/users/${createdUsername}/set-password`) // <<< Added /api prefix
                 .send(MOCK_SET_PASSWORD_PAYLOAD);
             expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
         });
    });

    // --- Group Management Tests ---
    describe('User Group Management (/api/admin/users/:username/groups)', () => {
         // ... (Keep tests, add /api prefix to paths)
          it('POST /:username/groups - should return 200 OK when adding user to group', async () => {
             if (!createdUsername) throw new Error('Cannot run add group test, user creation failed previously.');
             // TODO: Ensure testGroupName exists in Cognito if needed
             const res = await request(app)
                 .post(`/api/admin/users/${createdUsername}/groups`) // <<< Added /api prefix
                 .set(MOCK_AUTH_HEADER)
                 .send(MOCK_ADD_GROUP_PAYLOAD);
             expect(res.status).toBe(HttpStatusCode.OK);
             expect(res.body?.message).toContain(`User ${createdUsername} added to group ${testGroupName}.`);
         });

         it('GET /:username/groups - should return 200 OK and list groups for user', async () => {
              if (!createdUsername) throw new Error('Cannot run list groups test, user creation failed previously.');
              const res = await request(app)
                 .get(`/api/admin/users/${createdUsername}/groups`) // <<< Added /api prefix
                 .set(MOCK_AUTH_HEADER);
              expect(res.status).toBe(HttpStatusCode.OK);
              expect(res.body).toHaveProperty('groups');
              expect(res.body.groups).toBeInstanceOf(Array);
              expect(res.body.groups).toEqual(
                 expect.arrayContaining([
                     expect.objectContaining({ GroupName: testGroupName })
                 ])
              );
         });

         it('DELETE /:username/groups/:groupName - should return 204 No Content when removing user from group', async () => {
            if (!createdUsername) throw new Error('Cannot run remove group test, user creation failed previously.');
             const res = await request(app)
                 .delete(`/api/admin/users/${createdUsername}/groups/${testGroupName}`) // <<< Added /api prefix
                 .set(MOCK_AUTH_HEADER);
            expect(res.status).toBe(HttpStatusCode.NO_CONTENT);
             // Verify removal
            const getRes = await request(app).get(`/api/admin/users/${createdUsername}/groups`).set(MOCK_AUTH_HEADER); // <<< Added /api prefix
             expect(getRes.body.groups).not.toEqual(
                 expect.arrayContaining([
                     expect.objectContaining({ GroupName: testGroupName })
                 ])
             );
         });

         it('POST /:username/groups - should return 400 Bad Request if groupName missing', async () => {
            if (!createdUsername) throw new Error('Cannot run add group invalid test, user creation failed previously.');
             const res = await request(app)
                 .post(`/api/admin/users/${createdUsername}/groups`) // <<< Added /api prefix
                 .set(MOCK_AUTH_HEADER)
                 .send({});
             expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
             expect(res.body?.error?.issues).toEqual(
                 expect.arrayContaining([
                     expect.objectContaining({ path: ['body', 'groupName'] })
                 ])
             );
         });
    });


    // --- DELETE /api/admin/users/:username ---
    describe('DELETE /api/admin/users/:username', () => {
        // ... (Keep tests, add /api prefix to paths)
        it('should return 204 No Content if username exists and authorized', async () => {
            if (!createdUsername) throw new Error('Cannot run DELETE test, user may not have been created or already deleted.');

            const res = await request(app)
                .delete(`/api/admin/users/${createdUsername}`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
            expect(res.status).toBe(HttpStatusCode.NO_CONTENT);
            createdUsername = null; // Mark as deleted
        });

        it('should return 404 Not Found if username does not exist', async () => {
            const nonExistentUsername = 'non-existent-user-12345@example.com';
            const res = await request(app)
                .delete(`/api/admin/users/${nonExistentUsername}`) // <<< Added /api prefix
                .set(MOCK_AUTH_HEADER);
            expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            const usernameForPath = createdUsername || testUsername; // Need a username for path
            const res = await request(app).delete(`/api/admin/users/${usernameForPath}`); // <<< Added /api prefix
            expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
        });
    });
});