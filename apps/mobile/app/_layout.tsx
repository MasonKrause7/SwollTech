// Import single weights so the app bundle only carries the five fonts it uses.
import { Barlow_400Regular } from "@expo-google-fonts/barlow/400Regular";
import { Barlow_500Medium } from "@expo-google-fonts/barlow/500Medium";
import { Barlow_600SemiBold } from "@expo-google-fonts/barlow/600SemiBold";
import { BarlowCondensed_600SemiBold } from "@expo-google-fonts/barlow-condensed/600SemiBold";
import { BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed/700Bold";
import { useFonts } from "expo-font";
import { SplashScreen, Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
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

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
  });
  // If fonts fail to load the app still works with system fonts.
  if (!loaded && !error) return null;
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
