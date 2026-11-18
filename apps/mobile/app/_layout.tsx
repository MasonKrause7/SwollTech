// Import single weights so the app bundle only carries the five fonts it uses.
import { Barlow_400Regular } from "@expo-google-fonts/barlow/400Regular";
import { Barlow_500Medium } from "@expo-google-fonts/barlow/500Medium";
import { Barlow_600SemiBold } from "@expo-google-fonts/barlow/600SemiBold";
import { BarlowCondensed_600SemiBold } from "@expo-google-fonts/barlow-condensed/600SemiBold";
import { BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed/700Bold";
import { useFonts } from "expo-font";
import { SplashScreen, Stack, useRouter, useSegments, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Image, Pressable, Text, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { art } from "../src/art";
import { AuthProvider, useAuth } from "../src/auth";
import { NotebookProvider } from "../src/notebook";
import { syncNow, watchNetwork } from "../src/sync";
import { fonts, useTheme } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

const PUBLIC = new Set(["sign-in", "sign-up", "reset"]);

function Guard() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();
  const scheme = useColorScheme();

  useEffect(() => {
    if (status === "loading") return;
    const first = String(segments[0] ?? "");
    const inPublic = PUBLIC.has(first);
    if (status === "signed-out" && !inPublic) router.replace("/sign-in");
    if (status === "signed-in" && (inPublic || first === "")) router.replace("/(tabs)");
    void SplashScreen.hideAsync();
  }, [status, segments, router]);

  useEffect(() => {
    if (status !== "signed-in") return;
    const stopNetwork = watchNetwork();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow();
    });
    return () => {
      stopNetwork();
      subscription.remove();
    };
  }, [status]);

  return (
    <>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: fonts.displaySemi, fontSize: 20 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.bg },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: "Create account" }} />
        <Stack.Screen name="reset" options={{ title: "Reset password" }} />
        <Stack.Screen name="session/[id]" options={{ headerShown: false, gestureEnabled: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="summary/[id]" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="workout/[id]" options={{ title: "Workout" }} />
        <Stack.Screen name="history/[id]" options={{ title: "Session" }} />
        <Stack.Screen name="exercise/[id]" options={{ title: "Exercise" }} />
      </Stack>
    </>
  );
}

/**
 * Last line of defence for a render error anywhere in the app. Without it a release build
 * closes on the spot. Nothing here depends on the providers above, which may be what broke.
 * Logged sets are already in SQLite, so retrying loses nothing.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: "#0F1011", padding: 24, justifyContent: "center", gap: 16 }}>
      <Image source={art.mark} accessible={false} style={{ width: 64, height: 64, borderRadius: 16 }} />
      <Text style={{ color: "#F4F4F2", fontSize: 28, fontWeight: "700" }}>Something went wrong</Text>
      <Text style={{ color: "#8E9196", fontSize: 16, lineHeight: 22 }}>
        Your logged sets are saved on this phone. Try again, and if it keeps happening, email support@everydaytechllc.com.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={{ backgroundColor: "#F4F4F2", borderRadius: 12, paddingVertical: 16, alignItems: "center" }}
      >
        <Text style={{ color: "#0F1011", fontSize: 17, fontWeight: "600" }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
  });
  // If fonts fail to load the app still works with system fonts.
  if (!loaded && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F1011", alignItems: "center", justifyContent: "center" }}>
        <Image source={art.mark} accessible={false} style={{ width: 96, height: 96, borderRadius: 22 }} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotebookProvider>
          <Guard />
        </NotebookProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
