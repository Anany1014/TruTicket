import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { canTransact, useAuth } from "../../auth/session";
import { formatRupees, listingLabel, type AppListing } from "../../services/marketplace";
import { cancelListing, fetchListings, fetchMyListings, startResalePurchase, waitForNewTicket } from "../../services/resale";
import { fetchMyTickets } from "../../services/tickets";
import { messageOf } from "../../services/errors";
import { formatWhen } from "../../services/format";
import { colors, fontSize, fontWeight, radius, space } from "../../theme";

/**
 * Resale marketplace (PRD 6.5). Every price is capped by the platform: the seller cannot ask more than the cap.
 * Buying opens the hosted Razorpay page in the browser. The ticket moves to the buyer only after the webhook.
 */
export default function Resale() {
  const { session } = useAuth();
  const [listings, setListings] = useState<AppListing[]>([]);
  const [mine, setMine] = useState<AppListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [all, own] = await Promise.all([fetchListings(), fetchMyListings()]);
      setListings(all);
      setMine(own);
    } catch (e) {
      setError(messageOf(e, "Could not load the marketplace."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session) void load();
    }, [session, load]),
  );

  const mineIds = new Set(mine.map((m) => m.id));
  const others = listings.filter((l) => !mineIds.has(l.id));

  async function buy(l: AppListing) {
    if (!canTransact(session)) {
      router.push("/verify-gate");
      return;
    }
    setBusyId(l.id);
    setError(null);
    setNotice(null);
    try {
      const url = await startResalePurchase(l.id);
      const before = (await fetchMyTickets().catch(() => [])).length;
      await WebBrowser.openBrowserAsync(url);
      const arrived = await waitForNewTicket(before);
      setNotice(
        arrived
          ? "Payment received. The ticket is in My Tickets."
          : "Payment not confirmed yet. Check My Tickets in a minute. If it did not go through, the listing is free again.",
      );
      await load();
    } catch (e) {
      setError(messageOf(e, "Could not start the purchase. Try again."));
    } finally {
      setBusyId(null);
    }
  }

  async function take(l: AppListing) {
    setBusyId(l.id);
    setError(null);
    setNotice(null);
    try {
      await cancelListing(l.id);
      setNotice("Listing taken down. The ticket is yours again.");
      await load();
    } catch (e) {
      setError(messageOf(e, "Could not take the listing down."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Text style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        ← Back
      </Text>
      <Text style={styles.title}>Resale marketplace</Text>
      <Text style={styles.body}>
        Prices are capped at face value × the event cap. The platform sets the cap, not the seller.
      </Text>

      {!session ? (
        <View style={styles.card}>
          <Text style={styles.body}>Sign in to see listings and buy or sell tickets.</Text>
          <Button label="Sign in" onPress={() => router.push("/login")} testID="resale-sign-in" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.ok}>{notice}</Text> : null}
          {loading && listings.length === 0 ? <Text style={styles.meta}>Loading…</Text> : null}

          {mine.length > 0 ? <Text style={styles.section}>My listings</Text> : null}
          {mine.map((l) => (
            <View key={l.id} style={styles.card}>
              <Text style={styles.event}>{l.eventTitle}</Text>
              <Text style={styles.meta}>
                {l.venue} · {formatWhen(l.startsAt)}
              </Text>
              <Row label="Ask price" value={formatRupees(l.askRupees)} strong />
              <Text style={styles.meta}>{listingLabel(l.status)}</Text>
              <Button
                label="Take down listing"
                variant="secondary"
                onPress={() => take(l)}
                disabled={l.status !== "ACTIVE" || busyId !== null}
                loading={busyId === l.id}
                testID={`take-${l.id}`}
              />
            </View>
          ))}

          <Text style={styles.section}>For sale</Text>
          {!loading && others.length === 0 ? <Text style={styles.meta}>No tickets listed right now.</Text> : null}
          {others.map((l) => (
            <View key={l.id} style={styles.card}>
              <Text style={styles.event}>{l.eventTitle}</Text>
              <Text style={styles.meta}>
                {l.venue} · {formatWhen(l.startsAt)}
              </Text>
              <Row label="Max allowed (cap)" value={formatRupees(l.maxRupees)} />
              <Row label="Ask price" value={formatRupees(l.askRupees)} strong />
              <Button
                label={`Buy for ${formatRupees(l.askRupees)}`}
                onPress={() => buy(l)}
                disabled={busyId !== null}
                loading={busyId === l.id}
                testID={`buy-${l.id}`}
              />
            </View>
          ))}

          <Button label="Sell one of my tickets" variant="secondary" onPress={() => router.push("/tickets")} />
        </ScrollView>
      )}
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brand.cyan, fontSize: fontSize.md, paddingVertical: space.md },
  title: { color: colors.text.primary, fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  body: { color: colors.text.muted, fontSize: fontSize.sm, lineHeight: 20, marginTop: space.xs, marginBottom: space.md },
  section: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginTop: space.sm },
  list: { paddingBottom: space.xxl, gap: space.md },
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.bg.border,
    padding: space.md,
    gap: space.xs,
  },
  event: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  meta: { color: colors.text.muted, fontSize: fontSize.sm },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space.xxs },
  rowLabel: { color: colors.text.muted, fontSize: fontSize.md },
  rowValue: { color: colors.text.primary, fontSize: fontSize.md },
  strong: { fontWeight: fontWeight.bold, color: colors.brand.cyan },
  ok: { color: colors.status.success, fontSize: fontSize.sm },
  error: { color: colors.status.danger, fontSize: fontSize.sm },
});
