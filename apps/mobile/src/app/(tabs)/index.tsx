import React, { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Logo } from "../../components/Logo";
import { EventArt } from "../../components/EventArt";
import { useEvents } from "../../services/events";
import { colors, fontSize, fontWeight, radius, space } from "../../theme";

const CATEGORY_CHIPS = ["All", "Concerts", "Comedy", "Sports", "Festivals"] as const;

/** City from the venue text, e.g. "DY Patil Stadium, Navi Mumbai" → "Navi Mumbai". */
function cityOf(venue: string): string {
  const parts = venue.split(",");
  return (parts[parts.length - 1] ?? venue).trim();
}

function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Home / Explore. Events come from the events service. */
export default function Explore() {
  const [category, setCategory] = useState<(typeof CATEGORY_CHIPS)[number]>("All");
  const [city, setCity] = useState<string>("All cities");
  const [query, setQuery] = useState("");

  const all = useEvents();
  const events = all.data ?? [];

  const cities = useMemo(() => {
    const set = new Set(events.map((e) => cityOf(e.venue)));
    return ["All cities", ...Array.from(set)];
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      const catOk = category === "All" || e.category === category;
      const cityOk = city === "All cities" || cityOf(e.venue) === city;
      const qOk = !q || e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q);
      return catOk && cityOk && qOk;
    });
  }, [events, category, city, query]);

  const featured = filtered[0];
  const nearYou = filtered.slice(1);

  return (
    <Screen edges={["top"]}>
      <View style={styles.topBar}>
        <Logo size="sm" showWordmark />
        <View style={styles.topRight}>
          <Pressable onPress={() => all.reload()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Refresh">
            <Text style={styles.iconText}>↻</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/security")} style={styles.verifyPill} accessibilityRole="button">
            <Text style={styles.verifyText}>✓ Verify</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={!!all.loading && !!all.data} onRefresh={all.reload} tintColor={colors.brand.ctaCyan} />}
      >
        <View style={styles.hero}>
          <Text style={styles.greeting}>Explore events</Text>
          <Text style={styles.subtitle}>Verified live drops · Zero scalper markups</Text>
        </View>

        <Chips items={cities} active={city} onPick={setCity} />

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search concerts, cricket, comedy, venues"
            placeholderTextColor={colors.text.muted}
            style={styles.search}
            accessibilityLabel="Search events"
          />
        </View>

        <Chips items={[...CATEGORY_CHIPS]} active={category} onPick={setCategory} />

        {all.error ? (
          <Pressable onPress={all.reload} style={styles.notice} accessibilityRole="button">
            <Text style={styles.noticeText}>{all.error} Tap to retry.</Text>
          </Pressable>
        ) : null}
        {all.loading && !all.data ? <Text style={styles.empty}>Loading events…</Text> : null}

        {featured ? (
          <Pressable onPress={() => router.push(`/event/${featured.id}`)} accessibilityRole="button" style={styles.featured}>
            <EventArt event={featured} style={styles.featuredArt} fade>
              <View style={styles.featuredTop}>
                <Text style={styles.badgePurple}>⚡ Featured drop</Text>
                <Text style={styles.badgeGreen}>110% cap</Text>
              </View>
              <View style={styles.featuredBottom}>
                <Text style={styles.kicker}>
                  {cityOf(featured.venue).toUpperCase()} · {featured.when.toUpperCase()}
                </Text>
                <Text style={styles.featuredTitle} numberOfLines={2}>
                  {featured.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {featured.venue}
                </Text>
                <View style={styles.priceRow}>
                  <View>
                    <Text style={styles.startsAt}>STARTS AT</Text>
                    <Text style={styles.price}>{rupees(featured.fromPrice)}</Text>
                  </View>
                  <View style={styles.viewBtn}>
                    <Text style={styles.viewBtnText}>View passes</Text>
                  </View>
                </View>
              </View>
            </EventArt>
          </Pressable>
        ) : null}

        {nearYou.length > 0 ? <Text style={styles.sectionTitle}>Near you</Text> : null}
        {nearYou.map((e) => (
          <Pressable key={e.id} onPress={() => router.push(`/event/${e.id}`)} style={styles.row} accessibilityRole="button">
            <EventArt event={e} style={styles.thumb} />
            <View style={styles.rowText}>
              <Text style={styles.rowCategory}>{e.category.toUpperCase()}</Text>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {e.title}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {cityOf(e.venue)} · {e.when}
              </Text>
            </View>
            <View style={styles.rowPrice}>
              <Text style={styles.price}>{rupees(e.fromPrice)}</Text>
              <Text style={styles.meta}>onwards</Text>
            </View>
          </Pressable>
        ))}

        {all.data && filtered.length === 0 ? <Text style={styles.empty}>No events match your filters.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function Chips<T extends string>({ items, active, onPick }: { items: readonly T[] | T[]; active: string; onPick: (v: any) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap} contentContainerStyle={styles.chips}>
      {items.map((c) => {
        const on = c === active;
        return (
          <Pressable key={c} onPress={() => onPick(c)} accessibilityRole="button" style={[styles.chip, on && styles.chipActive]}>
            <Text style={[styles.chipText, on && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.xs,
    paddingBottom: space.xs,
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: space.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { color: colors.text.primary, fontSize: fontSize.lg },
  verifyPill: {
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand.ctaCyan,
    justifyContent: "center",
  },
  verifyText: { color: colors.brand.ctaCyan, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  body: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.md },
  hero: { gap: 2 },
  greeting: { color: colors.text.primary, fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  subtitle: { color: colors.text.muted, fontSize: fontSize.sm },
  chipsWrap: { flexGrow: 0 },
  chips: { gap: space.sm, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.bg.border,
    backgroundColor: colors.bg.card,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    height: 36,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.brand.ctaCyan, borderColor: colors.brand.ctaCyan },
  chipText: { color: colors.text.secondary, fontSize: fontSize.sm },
  chipTextActive: { color: "#0A0A0C", fontWeight: fontWeight.semibold },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.bg.border,
    backgroundColor: colors.bg.card,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  searchIcon: { color: colors.text.muted, fontSize: fontSize.xl },
  search: { flex: 1, color: colors.text.primary, fontSize: fontSize.md, height: "100%" },
  notice: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  noticeText: { color: colors.text.primary, fontSize: fontSize.sm, textAlign: "center" },
  featured: {
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.bg.border,
  },
  featuredArt: { height: 270, justifyContent: "space-between", padding: space.md },
  featuredTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  featuredBottom: { gap: 4 },
  badgePurple: {
    color: "#DDD6FE",
    backgroundColor: "rgba(139,92,246,0.35)",
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    overflow: "hidden",
  },
  badgeGreen: {
    color: "#BBF7D0",
    backgroundColor: "rgba(34,197,94,0.25)",
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    overflow: "hidden",
  },
  kicker: { color: colors.brand.ctaCyan, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 1 },
  featuredTitle: { color: "#FFFFFF", fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  meta: { color: colors.text.secondary, fontSize: fontSize.sm },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: space.sm,
  },
  startsAt: { color: colors.text.muted, fontSize: fontSize.xs, letterSpacing: 1 },
  price: { color: colors.brand.ctaCyan, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  viewBtn: {
    backgroundColor: colors.brand.ctaCyan,
    paddingHorizontal: space.lg,
    height: 42,
    borderRadius: radius.lg,
    justifyContent: "center",
  },
  viewBtnText: { color: "#0A0A0C", fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  sectionTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginTop: space.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.bg.border,
    backgroundColor: colors.bg.card,
  },
  thumb: { width: 68, height: 68, borderRadius: radius.md },
  rowText: { flex: 1, gap: 2 },
  rowCategory: { color: colors.brand.purple, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 1 },
  rowTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  rowPrice: { alignItems: "flex-end" },
  empty: { color: colors.text.muted, textAlign: "center", marginTop: space.xl },
});
