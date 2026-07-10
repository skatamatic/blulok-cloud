/** Max duration the Remote Gate widget offers for timed open (minutes). */
export const WIDGET_TIMED_OPEN_MAX_MINUTES = 60;

/** Max future window for open_until relative to command issue time (seconds). */
export const OPEN_UNTIL_MAX_FUTURE_SEC = WIDGET_TIMED_OPEN_MAX_MINUTES * 60;
