// Plus Jakarta Sans for all text from one place. Custom fonts on native are
// one file per weight, so fontWeight cannot pick the face on its own: this
// replaces react-native's Text and TextInput with thin wrappers that map the
// style's fontWeight/fontStyle to the right face. Screens keep importing Text
// and TextInput from "react-native" unchanged.
import { createElement } from "react";
import * as ReactNative from "react-native";
import { StyleSheet, type TextProps, type TextInputProps } from "react-native";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_400Regular_Italic,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_500Medium_Italic,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_600SemiBold_Italic,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_700Bold_Italic,
  PlusJakartaSans_800ExtraBold,
  PlusJakartaSans_800ExtraBold_Italic,
} from "@expo-google-fonts/plus-jakarta-sans";

export const fontAssets = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_400Regular_Italic,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_500Medium_Italic,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_600SemiBold_Italic,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_700Bold_Italic,
  PlusJakartaSans_800ExtraBold,
  PlusJakartaSans_800ExtraBold_Italic,
};

const FACES: Record<string, string> = {
  "400": "PlusJakartaSans_400Regular",
  "500": "PlusJakartaSans_500Medium",
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
  "800": "PlusJakartaSans_800ExtraBold",
};

function faceFor(style: unknown): object | null {
  const flat = (StyleSheet.flatten(style as never) ?? {}) as {
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: string;
  };
  // An explicit fontFamily (e.g. a monospace face) is left alone.
  if (flat.fontFamily) return null;

  const weight = flat.fontWeight === "bold" ? "700" : String(flat.fontWeight ?? "400");
  const n = Number(weight);
  const base = FACES[weight] ?? (n >= 800 ? FACES["800"] : n >= 700 ? FACES["700"] : n >= 600 ? FACES["600"] : n >= 500 ? FACES["500"] : FACES["400"]);
  const fontFamily = flat.fontStyle === "italic" ? `${base}_Italic` : base;
  // The face already carries the weight/slant; resetting avoids faux bold.
  return { fontFamily, fontWeight: "normal", fontStyle: "normal" };
}

let applied = false;

export function applyDefaultFont() {
  if (applied) return;
  applied = true;

  const NativeText = ReactNative.Text;
  const NativeTextInput = ReactNative.TextInput;

  function Text(props: TextProps) {
    const face = faceFor(props.style);
    return createElement(NativeText, face ? { ...props, style: [props.style, face] } : props);
  }
  Text.displayName = "Text";

  function TextInput(props: TextInputProps) {
    const face = faceFor(props.style);
    return createElement(NativeTextInput, face ? { ...props, style: [props.style, face] } : props);
  }
  TextInput.displayName = "TextInput";

  Object.defineProperty(ReactNative, "Text", { value: Text, configurable: true, enumerable: true });
  Object.defineProperty(ReactNative, "TextInput", { value: TextInput, configurable: true, enumerable: true });
}
