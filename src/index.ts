import { Elysia } from "elysia";
import { sealData, unsealData } from "iron-session";

interface SessionOptions {
  password: string;
  ttl?: number;
  cookieName?: string;
  secure?: boolean;
}

const defaultOptions = {
  ttl: 14 * 24 * 60 * 60, // 14 days
  cookieName: "session",
  secure: true,
} as const;

type IronSession<T> = {
  [P in keyof T]: T[P] extends object ? IronSession<T[P]> : T[P];
};

export const IronSession = <T extends object>(options: SessionOptions) => {
  const sessionOptions = { ...defaultOptions, ...options };

  return (
    new Elysia()
      .derive({ as: "global" }, async ({ cookie }) => {
        const session = cookie[sessionOptions.cookieName];
        let updatePromise: Promise<void> | null = null;

        const updateSession = async (newData: T) => {
          const sealed = await sealData(newData, {
            password: sessionOptions.password,
            ttl: sessionOptions.ttl,
          });
          session.value = sealed;
          session.maxAge = sessionOptions.ttl;
          session.httpOnly = true;
          session.secure = sessionOptions.secure;
        };

        // Create a deep proxy for nested objects
        const createDeepProxy = <K extends object>(
          target: K,
          rootData: T,
        ): IronSession<K> => {
          return new Proxy(target, {
            get(target, property: string | symbol) {
              const value = target[property as keyof K];
              if (value && typeof value === "object") {
                return createDeepProxy(value as object, rootData);
              }
              return value;
            },

            set(target, property: string | symbol, value: any): boolean {
              if (value && typeof value === "object") {
                target[property as keyof K] = createDeepProxy(
                  value,
                  rootData,
                ) as K[keyof K];
              } else {
                target[property as keyof K] = value;
              }
              updatePromise = updateSession(rootData);
              return true;
            },

            deleteProperty(target, property: string | symbol): boolean {
              delete target[property as keyof K];
              updatePromise = updateSession(rootData);
              return true;
            },
          }) as IronSession<K>;
        };

        // Initialize session data
        let sessionData: T;
        try {
          sessionData = session?.value
            ? await unsealData<T>(session.value, {
                password: sessionOptions.password,
                ttl: sessionOptions.ttl,
              })
            : ({} as T);
        } catch (e) {
          sessionData = {} as T;
        }

        // Wrap the session data in a deep proxy
        const wrappedSession = createDeepProxy(sessionData, sessionData);

        return {
          session: wrappedSession,
          commitSession: async () => {
            if (updatePromise) {
              await updatePromise;
              updatePromise = null;
            }
          },
        };
      })
      // make sure the cookie is updated and set-cookie header is added before the request
      .onAfterHandle({ as: "global" }, async ({ response, commitSession }) => {
        await commitSession();
        return response;
      })
  );
};

export default IronSession;
