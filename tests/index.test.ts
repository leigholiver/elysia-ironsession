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
        app.get('/test-empty', async ({ session }) => {
            return { sessionData: session }
        })

        const response = await app
            .handle(new Request('http://localhost/test-empty'))
            .then(res => res.json())

        expect(response).toEqual({ sessionData: {} })
    })

    it('should set and retrieve session data', async () => {
        app.post('/login', async ({ session }) => {
            session.userId = 123
            session.isLoggedIn = true
            return { success: true }
        })
        .get('/profile', async ({ session }) => {
            return { sessionData: session }
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
        app.get('/test-invalid', async ({ session }) => {
            return { sessionData: session }
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
        app.post('/set-initial', async ({ session }) => {
            session.userId = 123
            session.isLoggedIn = false
            return { success: true }
        })
        .post('/update', async ({ session }) => {
            session.isLoggedIn = true
            return session
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

    it('should handle new session creation with direct assignment', async () => {
        app.post('/set-new', async ({ session }) => {
            session.userId = 999
            session.isLoggedIn = true
            return { sessionData: session }
        })

        const response = await app
            .handle(new Request('http://localhost/set-new', {
                method: 'POST'
            }))

        const cookieHeader = response.headers.get('set-cookie')
        expect(cookieHeader).toBeTruthy()

        const responseData = await response.json()
        expect(responseData).toEqual({
            sessionData: {
                userId: 999,
                isLoggedIn: true
            }
        })
    })

    it('should handle deletion of session data', async () => {
        app.post('/set-data', async ({ session }) => {
            session.userId = 123
            session.isLoggedIn = true
            return { success: true }
        })
        .post('/destroy', async ({ session }) => {
            delete session.userId
            delete session.isLoggedIn
            return { session }
        })

        // First set some data
        const setResponse = await app
            .handle(new Request('http://localhost/set-data', { method: 'POST' }))
        const sessionCookie = setResponse.headers.get('set-cookie')

        // Then destroy it
        const destroyResponse = await app
            .handle(new Request('http://localhost/destroy', {
                method: 'POST',
                headers: {
                    cookie: sessionCookie!
                }
            }))

        const responseData = await destroyResponse.json()
        expect(responseData.session).toEqual({})
    })

    it('should handle empty options', async () => {
        const minimalApp = new Elysia()
            .use(IronSession<TestSession>({
                password: SESSION_SECRET
            }))

        minimalApp.get('/test', async ({ session }) => {
            return { sessionData: session }
        })

        const response = await minimalApp
            .handle(new Request('http://localhost/test'))
            .then(res => res.json())

        expect(response).toEqual({ sessionData: {} })
    })

    it('should set all cookie properties correctly', async () => {
        const customApp = new Elysia()
            .use(IronSession<TestSession>({
                password: SESSION_SECRET,
                cookieName: 'custom_session',
                ttl: 3600,
                secure: true
            }))

        customApp.post('/set-all', async ({ session }) => {
            session.userId = 123
            return { sessionData: session }
        })

        const response = await customApp
            .handle(new Request('http://localhost/set-all', { method: 'POST' }))

        const cookieHeader = response.headers.get('set-cookie')
        expect(cookieHeader).toBeTruthy()
        expect(cookieHeader).toContain('Max-Age=3600')
        expect(cookieHeader).toContain('HttpOnly')
        expect(cookieHeader).toContain('Secure')
        expect(cookieHeader).toContain('custom_session=')

        const data = await response.json()
        expect(data).toEqual({
            sessionData: {
                userId: 123
            }
        })
    })

    it('should handle nested session data', async () => {
        interface NestedSession {
            user?: {
                profile?: {
                    name?: string
                    settings?: {
                        theme?: string
                    }
                }
            }
        }

        const nestedApp = new Elysia()
            .use(IronSession<NestedSession>({
                password: SESSION_SECRET
            }))

        nestedApp.post('/set-nested', async ({ session }) => {
            session.user = {
                profile: {
                    name: 'John',
                    settings: {
                        theme: 'dark'
                    }
                }
            }
            return { success: true }
        })
        .get('/get-nested', async ({ session }) => {
            return { data: session }
        })

        // Set nested data
        const setResponse = await nestedApp
            .handle(new Request('http://localhost/set-nested', { method: 'POST' }))
        const sessionCookie = setResponse.headers.get('set-cookie')

        // Get nested data
        const getResponse = await nestedApp
            .handle(new Request('http://localhost/get-nested', {
                headers: {
                    cookie: sessionCookie!
                }
            }))

        const responseData = await getResponse.json()
        expect(responseData.data).toEqual({
            user: {
                profile: {
                    name: 'John',
                    settings: {
                        theme: 'dark'
                    }
                }
            }
        })
    })
})
