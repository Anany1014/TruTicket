import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "../../../components/Button";
import { Field } from "../../../components/Field";
import { Screen } from "../../../components/Screen";
import { canTransact, useAuth } from "../../../auth/session";
import { messageOf } from "../../../services/errors";
import { formatWhen } from "../../../services/format";
import { askError, capForFace, DEFAULT_CAP_BPS, formatRupees } from "../../../services/marketplace";
import { listTicketForResale } from "../../../services/resale";
import { fetchMyTickets } from "../../../services/tickets";
import type { AppTicket } from "../../../services/types";
import { colors, fontSize, fontWeight, radius, space } from "../../../theme";

/**
 * List one of my tickets for resale (PRD 6.5). The ask is capped by the platform.
 * While listed, the QR is hidden and the ticket cannot be scanned at the gate.
 */
export default function SellTicket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [ticket, setTicket] = useState<AppTicket | null | undefined>(undefined);
  const [askText, setAskText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMyTickets()
      .then((all) => alive && setTicket(all.find((t) => t.id === id) ?? null))
      .catch((e) => {
        if (alive) {
          setError(messageOf(e, "Could not load this ticket."));
          setTicket(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (ticket === undefined) {
    return (
      <Screen>
        <Text style={styles.back} onPress={() => router.back()}>
          ← Back
        </Text>
        <Text style={styles.body}>Loading…</Text>
      </Screen>
    );
  }

  if (!ticket || ticket.statusRaw !== "ISSUED_ACTIVE") {
    return (
      <Screen>
        <Text style={styles.back} onPress={() => router.back()}>
          ← Back
        </Text>
        <Text style={styles.heading}>This ticket cannot be listed.</Text>
        <Text style={styles.body}>{error ?? "Only active tickets that you hold can be listed for resale."}</Text>
      </Screen>
    );
  }

  const tk = ticket;
  const cap = capForFace(tk.faceValue, tk.capBps ?? DEFAULT_CAP_BPS);
  const ask = Number(askText.replace(/[^0-9]/g, ""));
  const err = askText.length > 0 ? askError(ask, cap) : "Enter a price in rupees.";

  async function onList() {
    if (!canTransact(session)) {
      router.push("/verify-gate");
      return;
    }
    if (err) return;
    setSubmitting(true);
    setError(null);
    try {
      await listTicketForResale(tk.id, ask);
      setDone(ask);
    } catch (e) {
      setError(messageOf(e, "Could not list this ticket. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  if (done !== null) {
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <Text style={styles.doneIcon}>✓</Text>
          <Text style={styles.heading}>Listed for {formatRupees(done)}</Text>
          <Text style={styles.body}>
            The QR is hidden while this ticket is listed, so it cannot be used at the gate. You can take the listing
            down from the resale marketplace.
          </Text>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Text style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        ← Back
      </Text>
      <Text style={styles.heading}>List for resale</Text>
      <Text style={styles.body}>
        {tk.eventTitle} · {tk.tierName}
        {tk.startAt ? ` · ${formatWhen(tk.startAt)}` : ""}
      </Text>

      <View style={styles.card}>
        <Row label="Face value (fixed)" value={formatRupees(tk.faceValue)} />
        <Row label={`Maximum ask (${(tk.capBps ?? DEFAULT_CAP_BPS) / 100}%)`} value={formatRupees(cap)} />
      </View>

      <Field
        label="Your ask price (₹)"
        value={askText}
        onChangeText={(t) => setAskText(t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        error={askText.length > 0 && err ? err : error}
        testID="ask-input"
      />

      <View style={{ flex: 1 }} />
      <Button
        label="List for resale"
        onPress={onList}
        disabled={!!err || submitting}
        loading={submitting}
        testID="confirm-list"
      />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brand.cyan, fontSize: fontSize.md, paddingVertical: space.md },
  heading: { color: colors.text.primary, fontSize: fontSize.xxl, fontWeight: fontWeight.bold, marginBottom: space.xs },
  body: { color: colors.text.muted, fontSize: fontSize.md, lineHeight: 22, marginBottom: space.lg },
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.bg.border,
    padding: space.md,
    marginBottom: space.md,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space.xxs },
  rowLabel: { color: colors.text.muted, fontSize: fontSize.md },
  rowValue: { color: colors.text.primary, fontSize: fontSize.md },
  doneWrap: { flex: 1, justifyContent: "center", gap: space.lg },
  doneIcon: { color: colors.status.success, fontSize: 48, textAlign: "center" },
});
