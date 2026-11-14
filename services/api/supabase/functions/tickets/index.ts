// TruTicket tickets Edge Function (PHASE2_PLAN §2.7). Signed-in buyer only.
//   { "action": "mine" }                       -> my tickets with event and type
//   { "action": "qr", "ticket_id": "<uuid>" }  -> a rotating QR token, valid 10 seconds
import { adminClient } from "../_shared/db.ts";
import { loadConfig } from "../_shared/env.ts";
import { ApiError, CORS_HEADERS, errorResponse, json, readJsonObject } from "../_shared/http.ts";
import { assertBuyerCanTransact, authenticateBuyer } from "../_shared/buyer.ts";
import { issueQr, QR_TTL_SECONDS } from "../_shared/qr.ts";
import { chainConfigFromEnv, inBackground, mintOnChain } from "../_shared/chain_call.ts";

// Tickets whose on-chain mint may still be missing. A buyer opening "mine" retries these (Phase 3, best effort).
const MINTABLE = new Set(["ISSUED_ACTIVE", "ISSUED_UNASSIGNED_GROUP"]);
const MAX_LAZY_MINTS = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse(new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST."));
  try {
    const cfg = loadConfig();
    const body = await readJsonObject(req);
    const buyer = await authenticateBuyer(cfg, req);
    const admin = adminClient(cfg);

    if (body.action === "mine") {
      const { data, error } = await admin
        .from("tickets")
        .select('id, status, faceValueMinor, "tokenId", events(id, title, venue, startAt, resaleCapBps), ticket_types(id, name)')
        .eq("currentOwnerId", buyer.userId)
        .order("createdAt", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      // Phase 3, best effort: retry any mint that never finished. Runs after the response.
      const missing = rows
        .filter((t) => t.tokenId === null && MINTABLE.has(String(t.status)))
        .slice(0, MAX_LAZY_MINTS)
        .map((t) => String(t.id));
      if (missing.length > 0) {
        const cfg2 = chainConfigFromEnv();
        inBackground(
          (async () => {
            for (const id of missing) await mintOnChain(cfg2, id);
          })(),
          "lazy-mint",
        );
      }
      return json({ ok: true, tickets: rows.map(({ tokenId: _t, ...rest }) => rest) });
    }

    if (body.action === "qr") {
      const ticketId = typeof body.ticket_id === "string" ? body.ticket_id : "";
      if (!UUID.test(ticketId)) throw new ApiError(400, "INVALID_INPUT", "Missing ticket id.");
      if (!cfg.qrHmacKey) throw new ApiError(500, "CONFIG_MISSING", "Tickets are not configured yet.");
      await assertBuyerCanTransact(cfg, buyer.token, buyer.userId);

      const q = await issueQr(cfg.qrHmacKey, ticketId, Date.now());
      const { data, error } = await admin.rpc("issue_qr_nonce", {
        p_ticket: ticketId,
        p_owner: buyer.userId,
        p_nonce_hash: q.nonceHash,
        p_expires: q.expiresAt.toISOString(),
      });
      if (error) throw error;
      if (data === "NOT_FOUND") throw new ApiError(404, "NOT_FOUND", "That ticket does not exist.");
      if (data === "NOT_YOURS") throw new ApiError(403, "NOT_YOURS", "That ticket is not yours.");
      if (data === "NOT_ACTIVE") throw new ApiError(409, "NOT_ACTIVE", "This ticket cannot be used.");
      if (data !== "OK") throw new ApiError(500, "TRY_AGAIN", "Could not make a QR. Try again.");
      return json({ ok: true, token: q.token, expires_at: q.expiresAt.toISOString(), ttl_seconds: QR_TTL_SECONDS });
    }

    throw new ApiError(400, "INVALID_ACTION", "Unknown action.");
  } catch (e) {
    return errorResponse(e);
  }
});
