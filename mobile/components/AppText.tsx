// Plus Jakarta Sans for all text. Custom fonts on native are one file per
// weight, so fontWeight cannot pick the face on its own: these wrappers map the
// style's fontWeight/fontStyle to the right face and drop fontWeight/fontStyle
// from the final style (Android does not want both together).
import { createContext, forwardRef, useContext } from "react";
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextProps,
  type TextInputProps,
} from "react-native";

const FACES: Record<string, string> = {
  "400": "PlusJakartaSans_400Regular",
  "500": "PlusJakartaSans_500Medium",
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
  "800": "PlusJakartaSans_800ExtraBold",
};

// Nested text inherits its parent's face unless it sets weight/style itself.
const NestedContext = createContext(false);

function resolveStyle(style: unknown, nested: boolean) {
  const flat = (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown> & {
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: string;
  };
  // An explicit fontFamily (e.g. a monospace face) is left alone.
  if (flat.fontFamily) return style;
  if (nested && flat.fontWeight === undefined && flat.fontStyle === undefined) return style;

  const raw = flat.fontWeight === "bold" ? 700 : flat.fontWeight === "normal" || flat.fontWeight === undefined ? 400 : Number(flat.fontWeight);
  const n = Number.isFinite(raw) ? raw : 400;
  const base = n >= 800 ? FACES["800"] : n >= 700 ? FACES["700"] : n >= 600 ? FACES["600"] : n >= 500 ? FACES["500"] : FACES["400"];
  const fontFamily = flat.fontStyle === "italic" ? `${base}_Italic` : base;

  const rest = { ...flat };
  delete rest.fontWeight;
  delete rest.fontStyle;
  return { ...rest, fontFamily };
}

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  const nested = useContext(NestedContext);
  return (
    <NestedContext.Provider value={true}>
      <RNText {...props} ref={ref} style={resolveStyle(props.style, nested) as TextProps["style"]} />
    </NestedContext.Provider>
  );
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput {...props} ref={ref} style={resolveStyle(props.style, false) as TextInputProps["style"]} />;
});
