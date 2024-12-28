# elysia-ironsession

A secure session management plugin for Elysia.js using [iron-session](https://github.com/vvo/iron-session). This plugin provides encrypted, stateless sessions with type-safety.

## Features

- 🔒 Secure, encrypted session storage using iron-session
- 🔑 HTTP-only cookie-based sessions
- ⚡ Fully type-safe with TypeScript
- 🎯 Simple, intuitive API
- ⏰ Configurable TTL (Time To Live)

## Installation

```bash
bun add elysia-ironsession
```

## Usage
Usage is the same as [Elysia's reactive Cookie](https://elysiajs.com/patterns/cookie#reactivity) - you extract the `session` property and access its items directly.

There's no get/set, you can extract the property name and retrieve or update its value directly.

Basic example:

```typescript
import { Elysia } from 'elysia'
import { IronSession } from 'elysia-ironsession'

// Define your session structure
interface UserSession {
  userId?: number
  isLoggedIn?: boolean
}

const app = new Elysia()
  .use(
    IronSession<UserSession>({
      password: process.env.SESSION_SECRET!, // At least 32 characters
      cookieName: 'my_session', // Optional, defaults to 'session'
      secure: process.env.NODE_ENV === 'production'
    })
  )
  .get('/profile', async ({ session }) => {
    if (!session?.isLoggedIn) {
      throw new Error('Unauthorized')
    }
    return { userId: session.userId }
  })
  .get('/login', async ({ session }) => {
    session.userId = 123
    session.isLoggedIn = true
    return { success: true }
  })
  .get('/logout', async ({ session }) => {
    delete session.userId
    delete session.isLoggedIn
    return { success: true }
  })
  .listen(3000)
```

## Configuration

The plugin accepts the following options:

```typescript
interface SessionOptions {
  password: string;      // Required: Secret key for encryption (min 32 chars)
  ttl?: number;          // Optional: Session duration in seconds (default: 14 days)
  cookieName?: string;   // Optional: Name of the session cookie (default: 'session')
  secure?: boolean;      // Optional: Set the secure attribute of the cookie (default true)
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.
