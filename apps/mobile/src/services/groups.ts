/** Group tickets: invite a team member, revoke an open invite, claim an invite. Source: the `groups` Edge Function. */
import { callFunction } from "./api";
import { toAppInvite, type AppInvite, type RawInvite } from "./marketplace";

export async function fetchMyInvites(): Promise<AppInvite[]> {
  const res = await callFunction<{ invites: RawInvite[] }>("groups", { action: "mine" }, { auth: true });
  return res.invites.map(toAppInvite);
}

/**
 * Invite a member by email. The claim code goes to their inbox only.
 * In demo mode the server also returns the code, so the demo can be tested without a mailbox.
 */
export async function allocateTicket(ticketId: string, inviteeEmail: string): Promise<{ devClaimCode: string | null }> {
  const res = await callFunction<{ dev_claim_code?: string }>(
    "groups",
    { action: "allocate", ticket_id: ticketId, invitee_email: inviteeEmail },
    { auth: true },
  );
  return { devClaimCode: res.dev_claim_code ?? null };
}

export async function revokeInvite(groupTicketId: string): Promise<void> {
  await callFunction("groups", { action: "revoke", group_ticket_id: groupTicketId }, { auth: true });
}

/** Accept an invite with the code from the email. Works once. */
export async function claimInvite(claimCode: string): Promise<void> {
  await callFunction("groups", { action: "claim", claim_code: claimCode.trim() }, { auth: true });
}
