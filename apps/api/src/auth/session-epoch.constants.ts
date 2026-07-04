/**
 * M7: max lifetime of a rememberMe session token (30 days), in seconds.
 *
 * Every `session-epoch-ms:<accountId>` Redis key (password reset, session rotation, account
 * erasure — see SessionGuard/OptionalSessionGuard) MUST use a TTL >= this value. The epoch key is
 * what makes a pre-existing JWT unusable after a reset/rotation; if the key expires before the
 * token itself does, a stolen rememberMe token becomes valid again once the epoch key is gone.
 */
export const REMEMBER_ME_MAX_AGE_S = 30 * 24 * 60 * 60;
