/**
 * App Store compliance gates (กฎเหล็ก).
 * When enabled, hide/disable features that would fail Apple Review.
 * Flip individual flags only when the real implementation ships.
 */
export const STORE_COMPLIANCE_MODE = true;

/** Boom Wallet screen + profile wallet entry (top-up / balance UI) */
export const ENABLE_BOOM_WALLET_UI = !STORE_COMPLIANCE_MODE;

/** Digital currency purchase / tip / top-up — needs StoreKit IAP first */
export const ENABLE_BOOM_COIN_PURCHASE_UI = !STORE_COMPLIANCE_MODE;

/**
 * Empty coin on feed (social reaction).
 * Off under compliance mode — Apple treats coin/currency chrome as digital goods risk.
 */
export const ENABLE_FEED_COIN_REACTION = !STORE_COMPLIANCE_MODE;

/** Paid tip creators with Boom Coin from wallet (consumable digital) */
export const ENABLE_CONTENT_TIPS = !STORE_COMPLIANCE_MODE;

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
