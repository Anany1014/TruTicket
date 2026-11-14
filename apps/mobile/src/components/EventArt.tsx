import React from "react";
import { Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { AppEvent } from "../services/types";

/**
 * Event artwork bundled with the app (AI-generated placeholders in assets/events).
 * The events table has no image column yet, so artwork is picked by category.
 * Swap these for real per-event images when the API provides them.
 */
const ART = {
  concert: require("../../assets/events/concert.jpg"),
  cricket: require("../../assets/events/cricket.jpg"),
  comedy: require("../../assets/events/comedy.jpg"),
  festival: require("../../assets/events/festival.jpg"),
  tech: require("../../assets/events/tech.jpg"),
} as const;

export function artFor(event: Pick<AppEvent, "title" | "category">) {
  if (/summit|tech|builder|\bai\b|conference/i.test(event.title)) return ART.tech;
  switch (event.category) {
    case "Sports":
      return ART.cricket;
    case "Comedy":
      return ART.comedy;
    case "Festivals":
      return ART.festival;
    default:
      return ART.concert;
  }
}

type Props = {
  event: Pick<AppEvent, "title" | "category" | "tint">;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  /** Dark fade at the bottom so text on top stays readable. */
  fade?: boolean;
  children?: React.ReactNode;
};

/** Artwork fills its box (cover). Falls back to the event's gradient if no artwork. */
export function EventArt({ event, style, imageStyle, fade = false, children }: Props) {
  return (
    <View style={[styles.box, style]}>
      <Image source={artFor(event)} style={[StyleSheet.absoluteFill, imageStyle]} resizeMode="cover" accessibilityIgnoresInvertColors />
      {fade ? (
        <LinearGradient
          colors={["rgba(10,10,12,0)", "rgba(10,10,12,0.85)"]}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden", backgroundColor: "#16161B" },
});
