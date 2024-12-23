import { describe, expect, it, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import IronSession from '../src'

interface TestSession {
    userId?: number
    isLoggedIn?: boolean
}

describe('Elysia Session Plugin', () => {
    const SESSION_SECRET = 'your-super-secret-password-at-least-32-chars'

    const newElysia = () => {
        return new Elysia()
            .use(IronSession<TestSession>({
                password: SESSION_SECRET,
                cookieName: 'test_session'
            }))
    }
    let app: ReturnType<typeof newElysia>
    beforeEach(() => {
        app = newElysia()
    })

    it('should handle new session with no data', async () => {
        app.get('/test-empty', async ({ getSessionData }) => {
            const data = await getSessionData()
            return { sessionData: data }
        })

        const response = await app
            .handle(new Request('http://localhost/test-empty'))
            .then(res => res.json())

        expect(response).toEqual({ sessionData: null })
    })

    it('should set and retrieve session data', async () => {
        app.post('/login', async ({ setSessionData }) => {
            await setSessionData(session => {
                session.userId = 123
                session.isLoggedIn = true
            })
            return { success: true }
        })
        .get('/profile', async ({ getSessionData }) => {
            const data = await getSessionData()
            return { sessionData: data }
        })

        // First, set the session data
        const loginResponse = await app
            .handle(new Request('http://localhost/login', { method: 'POST' }))

        // Get the session cookie from the response
        const sessionCookie = loginResponse.headers.get('set-cookie')
        expect(sessionCookie).toBeTruthy()

        // Now try to retrieve the session data with the cookie
        const profileResponse = await app
            .handle(new Request('http://localhost/profile', {
                headers: {
                    cookie: sessionCookie!
                }
            }))

        const profileData = await profileResponse.json()
        expect(profileData).toEqual({
            sessionData: {
                userId: 123,
                isLoggedIn: true
            }
        })
    })

    it('should handle invalid session data', async () => {
        app.get('/test-invalid', async ({ getSessionData }) => {
            const data = await getSessionData()
            return { sessionData: data }
        })

        // Try with an invalid session cookie
        const response = await app
            .handle(new Request('http://localhost/test-invalid', {
                headers: {
                    cookie: 'test_session=invalid-data'
                }
            }))
            .then(res => res.json())

        expect(response).toEqual({ sessionData: {} })
    })

    it('should update existing session data', async () => {
        app.post('/set-initial', async ({ setSessionData }) => {
            await setSessionData(session => {
                session.userId = 123
                session.isLoggedIn = false
            })
            return { success: true }
        })
        .post('/update', async ({ setSessionData, getSessionData }) => {
            await setSessionData(session => {
                session.isLoggedIn = true
            })
            return await getSessionData()
        })

        // Set initial session data
        const initialResponse = await app
            .handle(new Request('http://localhost/set-initial', { method: 'POST' }))
        const sessionCookie = initialResponse.headers.get('set-cookie')

        // Update the session
        const updateResponse = await app
            .handle(new Request('http://localhost/update', {
                method: 'POST',
                headers: {
                    cookie: sessionCookie!
                }
            }))

        const updatedData = await updateResponse.json()
        expect(updatedData).toEqual({
            userId: 123,
            isLoggedIn: true
        })
    })

    it('should handle setSessionData with no prior session', async () => {
        app.post('/set-new', async ({ setSessionData, getSessionData }) => {
            await setSessionData(session => {
                session.userId = 999;
                session.isLoggedIn = true;
            });
            // Return the session data immediately after setting it
            return { sessionData: await getSessionData() };
        });

        const response = await app
            .handle(new Request('http://localhost/set-new', {
                method: 'POST'
            }));

        const cookieHeader = response.headers.get('set-cookie');
        expect(cookieHeader).toBeTruthy();

        // Verify the response data
        const responseData = await response.json();
        expect(responseData).toEqual({
            sessionData: {
                userId: 999,
                isLoggedIn: true
            }
        });
    });

    it('should handle destruction of session data', async () => {
        app.post('/set-destroy', async ({ setSessionData }) => {
            await setSessionData(session => {
                // Set the session to undefined explicitly
                Object.keys(session).forEach(key => {
                    delete (session as any)[key];
                });
            });
            return { success: true };
        });

        const response = await app
            .handle(new Request('http://localhost/set-destroy', {
                method: 'POST'
            }));

        const cookieHeader = response.headers.get('set-cookie');
        expect(cookieHeader).toBeTruthy();
    });

    it('should handle empty options', async () => {
        const minimalApp = new Elysia()
            .use(IronSession<TestSession>({
                password: SESSION_SECRET
            }));

        minimalApp.get('/test', async ({ getSessionData }) => {
            const data = await getSessionData();
            return { sessionData: data };
        });

        const response = await minimalApp
            .handle(new Request('http://localhost/test'))
            .then(res => res.json());

        expect(response).toEqual({ sessionData: null });
    });

    it('should set all cookie properties correctly', async () => {
        // Create app with all options specified
        const customApp = new Elysia()
            .use(IronSession<TestSession>({
                password: SESSION_SECRET,
                cookieName: 'custom_session',
                ttl: 3600,
                secure: true
            }));

        customApp.post('/set-all', async ({ setSessionData, getSessionData }) => {
            await setSessionData(session => {
                session.userId = 123;
            });
            // Return both the session data and the cookie properties
            return { sessionData: await getSessionData() };
        });

        const response = await customApp
            .handle(new Request('http://localhost/set-all', { method: 'POST' }));

        const cookieHeader = response.headers.get('set-cookie');
        expect(cookieHeader).toBeTruthy();
        expect(cookieHeader).toContain('Max-Age=3600');
        expect(cookieHeader).toContain('HttpOnly');
        expect(cookieHeader).toContain('Secure');
        expect(cookieHeader).toContain('custom_session=');

        const data = await response.json();
        expect(data).toEqual({
            sessionData: {
                userId: 123
            }
        });
    });
})
