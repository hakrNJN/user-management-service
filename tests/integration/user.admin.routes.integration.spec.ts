import request from 'supertest';
import app from '../../src/app'; // Assuming your Express app instance is exported from here

// --- Mock Data ---
// Adjust these payloads based on your actual User model/DTO
const MOCK_AUTH_HEADER = { Authorization: 'Bearer test-token' };
const MOCK_NEW_USER_PAYLOAD = {
    email: `test-${Date.now()}@example.com`, // Ensure unique email for creation tests
    password: 'Password123!',
    firstName: 'Test',
    lastName: 'AdminUser',
    roles: ['admin', 'user'], // Example roles
    // Add other required fields
};
const MOCK_UPDATE_USER_PAYLOAD = {
    firstName: 'UpdatedFirstName',
    lastName: 'UpdatedLastName',
    // Add other updatable fields (note: usually email/password updates are separate flows)
};

// --- Test Suite ---
describe('User Admin API Integration (/admin/users)', () => {
    let createdUserId: string | null = null; // Store ID for use across tests if needed

    // Optional: Cleanup after all tests (e.g., delete the created user)
    // afterAll(async () => {
    //     if (createdUserId) {
    //         await request(app)
    //             .delete(`/admin/users/${createdUserId}`)
    //             .set(MOCK_AUTH_HEADER);
    //         // No need to assert here, just cleanup
    //     }
    // });

    // --- GET /admin/users ---
    describe('GET /admin/users', () => {
        it('should return 200 and a list of users when authorized', async () => {
            const res = await request(app)
                .get('/admin/users')
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body).toBeInstanceOf(Array);
            // Add more specific checks if needed, e.g., structure of user objects in the array
            // Example: Check if at least one user object has an id and email
            if (res.body.length > 0) {
                 expect(res.body[0]).toMatchObject({
                     id: expect.any(String),
                     email: expect.any(String),
                     // Add other expected fields
                 });
            }
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            const res = await request(app).get('/admin/users');
            expect(res.status).toBe(401);
            // Optionally check error message structure
            // expect(res.body).toHaveProperty('message', 'Unauthorized');
        });

        // Add test for invalid token if your auth middleware handles it
        // it('should return 401 Unauthorized if auth token is invalid', async () => { ... });
    });

    // --- POST /admin/users ---
    describe('POST /admin/users', () => {
        it('should return 201 and the created user when payload is valid and authorized', async () => {
            const res = await request(app)
                .post('/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_NEW_USER_PAYLOAD);

            expect(res.status).toBe(201);
            expect(res.body).toBeDefined();
            expect(res.body.id).toEqual(expect.any(String));
            expect(res.body.email).toBe(MOCK_NEW_USER_PAYLOAD.email);
            expect(res.body.firstName).toBe(MOCK_NEW_USER_PAYLOAD.firstName);
            // Important: Store the ID if you need it for subsequent tests (GET by ID, PUT, DELETE)
            createdUserId = res.body.id;
        });

        it('should return 400 Bad Request if payload is invalid (e.g., missing email)', async () => {
            const { email, ...invalidPayload } = MOCK_NEW_USER_PAYLOAD; // Remove email
            const res = await request(app)
                .post('/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload);

            expect(res.status).toBe(400);
            // Optionally check error message
            // expect(res.body).toHaveProperty('message', expect.stringContaining('email is required'));
        });

        it('should return 400 Bad Request if password is weak (if policy exists)', async () => {
             const weakPasswordPayload = { ...MOCK_NEW_USER_PAYLOAD, password: '123' };
             const res = await request(app)
                 .post('/admin/users')
                 .set(MOCK_AUTH_HEADER)
                 .send(weakPasswordPayload);

             expect(res.status).toBe(400);
             // Optionally check error message
             // expect(res.body).toHaveProperty('message', expect.stringContaining('Password does not meet criteria'));
         });


        it('should return 401 Unauthorized if auth token is missing', async () => {
            const res = await request(app)
                .post('/admin/users')
                .send(MOCK_NEW_USER_PAYLOAD);
            expect(res.status).toBe(401);
        });

        // Optional: Test for duplicate email (409 Conflict) - might require setup
        // it('should return 409 Conflict if email already exists', async () => { ... });
    });

    // --- GET /admin/users/:id ---
    describe('GET /admin/users/:id', () => {
        // Note: This test relies on a user being created previously or assumes an ID exists.
        // For robustness, consider creating a user in a beforeEach for this describe block.
        const existingUserId = 'some-pre-existing-or-created-id'; // Replace with a real ID or use createdUserId

        it('should return 200 and the specific user if ID exists and authorized', async () => {
            // If relying on the POST test above:
            if (!createdUserId) {
                console.warn("Skipping GET /:id test as no user was created in POST test.");
                return; // Or throw an error if creation is essential for this test
            }
            const userIdToFetch = createdUserId || existingUserId;

            const res = await request(app)
                .get(`/admin/users/${userIdToFetch}`)
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(200);
            expect(res.body).toBeDefined();
            expect(res.body.id).toBe(userIdToFetch);
            expect(res.body.email).toEqual(expect.any(String)); // Or match specific email if known
        });

        it('should return 404 Not Found if user ID does not exist', async () => {
            const nonExistentId = 'non-existent-user-id-12345';
            const res = await request(app)
                .get(`/admin/users/${nonExistentId}`)
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(404);
            // Optionally check error message
            // expect(res.body).toHaveProperty('message', 'User not found');
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            const userIdToFetch = createdUserId || existingUserId;
            const res = await request(app).get(`/admin/users/${userIdToFetch}`);
            expect(res.status).toBe(401);
        });
    });

    // --- PUT /admin/users/:id ---
    describe('PUT /admin/users/:id', () => {
        // Note: Relies on an existing user ID.
        const existingUserId = 'some-pre-existing-or-created-id'; // Replace or use createdUserId

        it('should return 200 and the updated user if ID exists, payload is valid, and authorized', async () => {
            if (!createdUserId) {
                 console.warn("Skipping PUT /:id test as no user was created in POST test.");
                 return;
            }
            const userIdToUpdate = createdUserId || existingUserId;

            const res = await request(app)
                .put(`/admin/users/${userIdToUpdate}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_USER_PAYLOAD);

            expect(res.status).toBe(200); // Or 204 if your API returns no content on update
            expect(res.body).toBeDefined(); // Adjust if 204
            expect(res.body.id).toBe(userIdToUpdate);
            expect(res.body.firstName).toBe(MOCK_UPDATE_USER_PAYLOAD.firstName);
            expect(res.body.lastName).toBe(MOCK_UPDATE_USER_PAYLOAD.lastName);
        });

        it('should return 400 Bad Request if update payload is invalid', async () => {
             if (!createdUserId) {
                  console.warn("Skipping PUT /:id (invalid payload) test as no user was created.");
                  return;
             }
             const userIdToUpdate = createdUserId || existingUserId;
             const invalidUpdatePayload = { firstName: '' }; // Example: Empty first name might be invalid

             const res = await request(app)
                 .put(`/admin/users/${userIdToUpdate}`)
                 .set(MOCK_AUTH_HEADER)
                 .send(invalidUpdatePayload);

             expect(res.status).toBe(400);
             // Optionally check error message
             // expect(res.body).toHaveProperty('message', expect.stringContaining('firstName cannot be empty'));
         });


        it('should return 404 Not Found if user ID does not exist', async () => {
            const nonExistentId = 'non-existent-user-id-12345';
            const res = await request(app)
                .put(`/admin/users/${nonExistentId}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_USER_PAYLOAD);

            expect(res.status).toBe(404);
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            const userIdToUpdate = createdUserId || existingUserId;
            const res = await request(app)
                .put(`/admin/users/${userIdToUpdate}`)
                .send(MOCK_UPDATE_USER_PAYLOAD);
            expect(res.status).toBe(401);
        });
    });

    // --- DELETE /admin/users/:id ---
    describe('DELETE /admin/users/:id', () => {
        // Note: Relies on an existing user ID. Consider creating a dedicated user for deletion tests.
        const existingUserId = 'some-pre-existing-or-created-id'; // Replace or use createdUserId

        it('should return 200 OK or 204 No Content if ID exists and authorized', async () => {
            if (!createdUserId) {
                 console.warn("Skipping DELETE /:id test as no user was created in POST test.");
                 return;
            }
            const userIdToDelete = createdUserId; // Use the ID created in the POST test

            const res = await request(app)
                .delete(`/admin/users/${userIdToDelete}`)
                .set(MOCK_AUTH_HEADER);

            expect([200, 204]).toContain(res.status); // Accept 200 or 204

            // If successful, prevent cleanup logic from trying to delete again
            if (res.status === 200 || res.status === 204) {
                createdUserId = null; // Mark as deleted
            }
        });

        it('should return 404 Not Found if user ID does not exist', async () => {
            const nonExistentId = 'non-existent-user-id-12345';
            const res = await request(app)
                .delete(`/admin/users/${nonExistentId}`)
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(404);
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            const userIdToDelete = createdUserId || existingUserId; // Need an ID for the path
             if (!userIdToDelete) {
                 console.warn("Skipping DELETE /:id (unauthorized) test as no user ID is available.");
                 return;
             }
            const res = await request(app).delete(`/admin/users/${userIdToDelete}`);
            expect(res.status).toBe(401);
        });
    });
});
