/**
 * App Store compliance gates (กฎเหล็ก).
 * When enabled, hide/disable features that would fail Apple Review.
 * Flip individual flags only when the real implementation ships.
 */
export const STORE_COMPLIANCE_MODE = true;

/** Fake checkout that claims payment success without a PSP */
export const ENABLE_CHECKOUT_PLACE_ORDER = !STORE_COMPLIANCE_MODE;

/** PayLater / credit / finance products not yet licensed */
export const ENABLE_PAYLATER_AND_CREDIT_UI = !STORE_COMPLIANCE_MODE;

/** Voice/video call UI without real WebRTC/VoIP */
export const ENABLE_CALLS = !STORE_COMPLIANCE_MODE;

/** User music upload / YouTube-branded surfaces without licenses */
export const ENABLE_MUSIC_UPLOAD = !STORE_COMPLIANCE_MODE;
export const ENABLE_YOUTUBE_STYLE_MUSIC_MENU = !STORE_COMPLIANCE_MODE;

/** Simulated camera studio / QR / “จำลอง” create tools */
export const ENABLE_SIMULATED_CAMERA_TOOLS = !STORE_COMPLIANCE_MODE;

/** Coming-soon shop chrome that only shows Alert */
export const ENABLE_COMING_SOON_SHOP_CHROME = !STORE_COMPLIANCE_MODE;

/** Fake LIVE tab / warehouse demo accept without a real backend path */
export const ENABLE_FAKE_LIVE_AND_DEMO_ACCEPT = !STORE_COMPLIANCE_MODE;

/**
 * LINE Login — no server id_token exchange yet. Keep off until verifier ships.
 * Apple (iOS) + Google (when client id set) + email are the store-safe set.
 */
export const ENABLE_LINE_LOGIN = false;

/** Mint local sessions without API — LAN-only; never in store builds */
export const ENABLE_OFFLINE_LOCAL_SESSION = !STORE_COMPLIANCE_MODE;
