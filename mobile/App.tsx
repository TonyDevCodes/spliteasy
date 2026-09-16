import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "./lib/supabase";

console.log("Supabase client initialized:", !!supabase);

export default function App() {
  return (
    <View style={styles.container}>
      <Text>SplitEasy Mobile - connected</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
