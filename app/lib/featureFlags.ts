// App-wide feature flags.
//
// STORE_ENABLED gates the Foopy Tokens store surface (the /store and /tokens
// pages, their nav/profile entries, and the "buy in store" prompts). Tokens are
// a purchase-only currency, so the store can't function until In-App Purchases
// are live. Set this back to `true` once IAP ships to re-enable everything —
// no code was removed, only hidden behind this flag.
// Typed as `boolean` (not the literal `false`) so guarded code paths aren't
// flagged as unreachable while the flag is off.
export const STORE_ENABLED: boolean = false;
