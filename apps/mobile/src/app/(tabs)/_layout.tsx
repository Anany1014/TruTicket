import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontSize, fontWeight, radius } from "../../theme";

/**
 * Bottom tabs: Explore, Tickets, Resale, Profile.
 * Height includes the phone's bottom inset, so the bar sits above the system
 * navigation buttons on Android and iPhone.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg.base },
        tabBarActiveTintColor: colors.brand.ctaCyan,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: {
          backgroundColor: colors.bg.surface,
          borderTopColor: colors.bg.border,
          borderTopWidth: 1,
          height: 60 + bottom,
          paddingTop: 6,
          paddingBottom: bottom,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Explore", tabBarIcon: ({ color, focused }) => <Glyph color={color} on={focused} char="◎" /> }}
      />
      <Tabs.Screen
        name="tickets"
        options={{ title: "Tickets", tabBarIcon: ({ color, focused }) => <Glyph color={color} on={focused} char="▤" /> }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{ title: "Resale", tabBarIcon: ({ color, focused }) => <Glyph color={color} on={focused} char="⇄" /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, focused }) => <Glyph color={color} on={focused} char="◯" /> }}
      />
      {/* Kept as a file, hidden from the tab bar. */}
      <Tabs.Screen name="categories" options={{ href: null }} />
    </Tabs>
  );
}

/** Icon with a lime pill behind it when the tab is active. */
function Glyph({ color, on, char }: { color: string | number | { [k: string]: any }; on: boolean; char: string }) {
  return (
    <View style={[styles.pill, on && styles.pillOn]}>
      <Text style={{ color: color as string, fontSize: 17, lineHeight: 20 }}>{char}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 56,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pillOn: { backgroundColor: "rgba(200,241,53,0.16)" },
});
