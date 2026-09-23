import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type ThemeColors } from "./theme";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Render error caught by ErrorBoundary:", error);
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback message={this.state.error.message} />;
    }

    return this.props.children;
  }
}

// Class components cannot use hooks, so the themed fallback is its own component.
function ErrorFallback({ message }: { message: string }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Something went wrong rendering this section: {message}
      </Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      padding: 16,
      backgroundColor: c.background,
    },
    text: {
      color: c.danger,
      fontSize: 14,
    },
  });
