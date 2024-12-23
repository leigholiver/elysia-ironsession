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

export const IronSession = <T>(options: SessionOptions) => {
  const sessionOptions = { ...defaultOptions, ...options };

  return new Elysia().derive({ as: "global" }, ({ cookie }) => {
    const session = cookie[sessionOptions.cookieName];

    const getSessionData = async (): Promise<T | null> => {
      if (!session?.value) {
        return null;
      }
      try {
        return await unsealData<T>(session.value, {
          password: sessionOptions.password,
          ttl: sessionOptions.ttl,
        });
      } catch (e) {
        return null;
      }
    };

    const setSessionData = async (updater: (session: T) => void) => {
      const currentSession = (await getSessionData()) || ({} as T);
      updater(currentSession);
      session.value = await sealData(currentSession, {
        password: sessionOptions.password,
        ttl: sessionOptions.ttl,
      });
      session.maxAge = sessionOptions.ttl;
      session.httpOnly = true;
      session.secure = sessionOptions.secure;
    };

    return {
      getSessionData,
      setSessionData,
    };
  });
};

export default IronSession
