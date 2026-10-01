export const SUPPORTED_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "ALL",
  "TRY",
  "PLN",
  "SEK",
  "NOK",
  "DKK",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_INFO: Record<
  SupportedCurrency,
  { name: string; countryCode: string }
> = {
  EUR: { name: "Euro", countryCode: "EU" },
  USD: { name: "US Dollar", countryCode: "US" },
  GBP: { name: "British Pound", countryCode: "GB" },
  CHF: { name: "Swiss Franc", countryCode: "CH" },
  ALL: { name: "Albanian Lek", countryCode: "AL" },
  TRY: { name: "Turkish Lira", countryCode: "TR" },
  PLN: { name: "Polish Zloty", countryCode: "PL" },
  SEK: { name: "Swedish Krona", countryCode: "SE" },
  NOK: { name: "Norwegian Krone", countryCode: "NO" },
  DKK: { name: "Danish Krone", countryCode: "DK" },
};

export const CURRENCY_CHANGE_WARNING =
  "Changing the currency does not convert existing amounts. They will be shown in the new currency as they are.";

export const DEFAULT_CURRENCY: SupportedCurrency = "EUR";

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function getCurrencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).formatToParts(0);
  const symbolPart = parts.find((p) => p.type === "currency");
  return symbolPart ? symbolPart.value : currency;
}

/** Emoji flag for a currency (Android renders these; Windows does not). */
export function currencyFlagEmoji(currency: string): string {
  const info = CURRENCY_INFO[currency as SupportedCurrency];
  if (!info) return "";
  return String.fromCodePoint(
    ...[...info.countryCode].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}
