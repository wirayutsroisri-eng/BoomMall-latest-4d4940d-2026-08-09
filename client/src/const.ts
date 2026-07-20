export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { isDevBypassEnabled } from "./devBypass";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  if (isDevBypassEnabled()) {
    // ไม่ redirect ไป OAuth จริง — อยู่ในแอปเพื่อทด UI
    return "/profile";
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl || !appId) {
    console.warn("[Auth] VITE_OAUTH_PORTAL_URL / VITE_APP_ID not set — login disabled");
    return "/profile";
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
