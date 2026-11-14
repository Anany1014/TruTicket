import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { canTransact, useAuth } from "../../auth/session";
import { messageOf } from "../../services/errors";
import { bucketFor, inviteLabel, type AppInvite } from "../../services/marketplace";
import { allocateTicket, fetchMyInvites, revokeInvite } from "../../services/groups";
import { fetchMyTickets } from "../../services/tickets";
import type { AppTicket } from "../../services/types";
import { colors, fontSize, fontWeight, radius, space } from "../../theme";

/**
 * Group distribution manager (PRD screen 11, FR-027). The route id is one unassigned group ticket.
 * The manager invites team members by email at zero cost. Each invite gives that ticket to the member once they claim it.
 */
export default function GroupManager() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [tickets, setTickets] = useState<AppTicket[] | null>(null);
  const [invites, setInvites] = useState<AppInvite[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [all, inv] = await Promise.all([fetchMyTickets(), fetchMyInvites()]);
      setTickets(all);
      setInvites(inv);
    } catch (e) {
      setError(messageOf(e, "Could not load group tickets."));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session) void load();
    }, [session, load]),
  );

  const anchor = tickets?.find((t) => t.id === id);
  const bucket = tickets ? bucketFor(tickets, anchor) : [];
  const claimed = invites.filter((i) => i.status === "CLAIMED").length;
  const pending = invites.filter((i) => i.status === "INVITED").length;

  async function invite() {
    if (!canTransact(session)) {
      router.push("/verify-gate");
      return;
    }
    if (bucket.length === 0) return;
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await allocateTicket(bucket[0].id, address);
      setEmail("");
      setNotice(
        res.devClaimCode
          ? `Invite sent to ${address}. Demo claim code: ${res.devClaimCode}`
          : `Invite sent to ${address}. They will get a claim code by email.`,
      );
      await load();
    } catch (e) {
      setError(messageOf(e, "Could not send the invite. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inv: AppInvite) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await revokeInvite(inv.id);
      setNotice("Invite cancelled. The ticket is back in your group.");
      await load();
    } catch (e) {
      setError(messageOf(e, "Could not cancel the invite."));
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <Screen>
        <Text style={styles.back} onPress={() => router.back()}>
          ← Back
        </Text>
        <Text style={styles.heading}>Sign in to manage group tickets.</Text>
        <Button label="Sign in" onPress={() => router.push("/login")} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Text style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        ← Back
      </Text>
      <Text style={styles.heading}>Group distribution</Text>
      <Text style={styles.body}>
        {anchor ? `${anchor.eventTitle} · ${anchor.tierName}` : "Group tickets"}
      </Text>

      <View style={styles.stats}>
        <Stat label="Unassigned" value={bucket.length} />
        <Stat label="Pending" value={pending} tone={colors.status.warning} />
        <Stat label="Claimed" value={claimed} tone={colors.status.success} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.ok}>{notice}</Text> : null}

      <Text style={styles.section}>Invite a team member</Text>
      <Field
        label="Team member's email"
        placeholder="name@company.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        testID="member-email"
      />
      <View style={{ height: space.sm }} />
      <Button
        label="Send invite"
        onPress={invite}
        disabled={bucket.length === 0 || busy}
        loading={busy}
        testID="send-invite"
      />

      <Text style={styles.section}>Your invites</Text>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {invites.length === 0 ? <Text style={styles.empty}>No invites yet.</Text> : null}
        {invites.map((inv) => (
          <View key={inv.id} style={styles.member}>
            <View style={{ flex: 1 }}>
              <Text style={styles.status}>{inviteLabel(inv.status)}</Text>
              {inv.expiresAt && inv.status === "INVITED" ? (
                <Text style={styles.meta}>Expires {new Date(inv.expiresAt).toLocaleDateString("en-IN")}</Text>
              ) : null}
            </View>
            {inv.status === "INVITED" ? (
              <Text style={styles.revoke} onPress={() => revoke(inv)} accessibilityRole="button">
                Cancel
              </Text>
            ) : null}
          </View>
        ))}
        <Text style={styles.note}>
          Invite emails are not shown here, only their status. A member's gate QR works only after they claim the
          ticket. You can cancel an invite nobody has claimed. Claimed tickets cannot be taken back.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brand.cyan, fontSize: fontSize.md, paddingVertical: space.md },
  heading: { color: colors.text.primary, fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  body: { color: colors.text.muted, fontSize: fontSize.sm, marginTop: space.xxs, marginBottom: space.md },
  stats: { flexDirection: "row", gap: space.xs },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.bg.border,
  },
  statValue: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  statLabel: { color: colors.text.muted, fontSize: fontSize.xs, marginTop: space.xxs },
  section: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginTop: space.lg, marginBottom: space.sm },
  list: { paddingBottom: space.xxl, gap: space.xs },
  member: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.bg.border,
  },
  status: { color: colors.text.primary, fontSize: fontSize.md },
  meta: { color: colors.text.muted, fontSize: fontSize.xs, marginTop: space.xxs },
  revoke: { color: colors.status.danger, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, padding: space.xs },
  empty: { color: colors.text.muted, fontSize: fontSize.md, textAlign: "center", marginTop: space.md },
  note: { color: colors.text.muted, fontSize: fontSize.sm, lineHeight: 20, marginTop: space.md },
  error: { color: colors.status.danger, fontSize: fontSize.sm, marginTop: space.xs },
  ok: { color: colors.status.success, fontSize: fontSize.sm, marginTop: space.xs },
});
