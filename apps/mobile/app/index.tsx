import { View } from "react-native";
import { useTheme } from "../src/theme";

/** The guard in the root layout sends you to sign in or to today. */
export default function Index() {
  const theme = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
}
