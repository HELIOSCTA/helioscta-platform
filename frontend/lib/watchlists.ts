/**
 * Report scope type for Genscape nominations.
 * The current frontend migration uses read-only, in-memory selections.
 */

export interface Watchlist {
  id: string;
  name: string;
  locationRoleIds: readonly number[];
  signOverrides?: Readonly<Record<string, number>>;
}
