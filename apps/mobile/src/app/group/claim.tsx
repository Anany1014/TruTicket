import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { canTransact, useAuth } from "../../auth/session";
import { messageOf } from "../../services/errors";
import { claimInvite } from "../../services/groups";
import { colors, fontSize, fontWeight, space } from "../../theme";

/** Accept a group ticket with the claim code from the invite email. Sign in with the invited email address. */
export default function ClaimInvite() {
  const { session } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function claim() {
    if (!canTransact(session)) {
      router.push("/verify-gate");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await claimInvite(code);
      setDone(true);
    } catch (e) {
      setError(messageOf(e, "Could not accept this invite. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Text style={styles.heading}>Ticket added</Text>
        <Text style={styles.body}>The group ticket is now in My Tickets. Its QR works from there.</Text>
        <Button label="Go to My Tickets" onPress={() => router.replace("/tickets")} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Text style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        ← Back
      </Text>
      <Text style={styles.heading}>Accept a group ticket</Text>
      <Text style={styles.body}>
        Enter the claim code from the invite email. It works once, and only for the email address that was invited.
      </Text>
      <Field
        label="Claim code"
        autoCapitalize="none"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
        error={error}
        testID="claim-code"
      />
      <Text style={styles.body} />
      <Button label="Accept ticket" onPress={claim} disabled={code.trim().length < 20 || busy} loading={busy} testID="claim-submit" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brand.cyan, fontSize: fontSize.md, paddingVertical: space.md },
  heading: { color: colors.text.primary, fontSize: fontSize.xxl, fontWeight: fontWeight.bold, marginBottom: space.xs },
  body: { color: colors.text.muted, fontSize: fontSize.md, lineHeight: 22, marginBottom: space.lg },
});
