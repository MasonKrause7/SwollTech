/**
 * Who the notebook on this phone belongs to, and what to do when someone signs in.
 *
 * The notebook is never wiped because a request was refused or a session expired: the same
 * person signs back in and their unsynced sets are still there. It is wiped only for an
 * explicit sign out (after a warning) or when a different account signs in, and then only
 * after the user confirms if anything in it was never saved to the old account.
 */
export type ClaimAction = "keep" | "clear" | "confirm-clear";

export function planClaim(input: { owner: string | null; userId: string; unsaved: number; hasData: boolean }): ClaimAction {
  const { owner, userId, unsaved, hasData } = input;
  if (owner === userId) return "keep";
  // No owner but rows: left behind by a sync that raced a sign out. They belong to nobody we know.
  if (!owner && !hasData) return "keep";
  return unsaved > 0 ? "confirm-clear" : "clear";
}
