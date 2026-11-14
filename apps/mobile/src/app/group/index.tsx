import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { bucketGroups, type BucketGroup } from "../../services/marketplace";
import { messageOf } from "../../services/errors";
import { fetchMyTickets } from "../../services/tickets";
import { colors, fontSize, fontWeight, radius, space } from "../../theme";

/** Group tickets I bought and have not given out yet. Pick one to share with my team. */
export default function GroupList() {
  const [groups, setGroups] = useState<BucketGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchMyTickets()
        .then((all) => alive && setGroups(bucketGroups(all)))
        .catch((e) => alive && setError(messageOf(e, "Could not load your group tickets.")));
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <Screen edges={["top", "bottom"]}>
      <Text style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        ← Back
      </Text>
      <Text style={styles.title}>Group tickets</Text>
      <Text style={styles.body}>Share the tickets you bought for your team. Each member gets an invite by email.</Text>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {groups && groups.length === 0 ? (
          <Text style={styles.body}>No unassigned group tickets. Buy a group of tickets to see them here.</Text>
        ) : null}
        {(groups ?? []).map((g) => (
          <View key={g.key} style={styles.card}>
            <Text style={styles.event}>{g.eventTitle}</Text>
            <Text style={styles.meta}>
              {g.tierName} · {g.ticketIds.length} unassigned
            </Text>
            <Button
              label="Manage and invite"
              onPress={() => router.push({ pathname: "/group/[id]", params: { id: g.ticketIds[0] } })}
              testID={`manage-${g.ticketIds[0]}`}
            />
          </View>
        ))}
        <Button label="I have a claim code" variant="secondary" onPress={() => router.push("/group/claim")} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brand.cyan, fontSize: fontSize.md, paddingVertical: space.md },
  title: { color: colors.text.primary, fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  body: { color: colors.text.muted, fontSize: fontSize.sm, lineHeight: 20, marginTop: space.xs, marginBottom: space.md },
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
  meta: { color: colors.text.muted, fontSize: fontSize.sm, marginBottom: space.xs },
  error: { color: colors.status.danger, fontSize: fontSize.sm },
});
