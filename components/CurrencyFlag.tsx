import type { ComponentType } from "react";
import AL from "country-flag-icons/react/3x2/AL";
import CH from "country-flag-icons/react/3x2/CH";
import DK from "country-flag-icons/react/3x2/DK";
import EU from "country-flag-icons/react/3x2/EU";
import GB from "country-flag-icons/react/3x2/GB";
import NO from "country-flag-icons/react/3x2/NO";
import PL from "country-flag-icons/react/3x2/PL";
import SE from "country-flag-icons/react/3x2/SE";
import TR from "country-flag-icons/react/3x2/TR";
import US from "country-flag-icons/react/3x2/US";
import { CURRENCY_INFO, type SupportedCurrency } from "@/lib/money";

type FlagComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const FLAGS: Record<string, FlagComponent> = { AL, CH, DK, EU, GB, NO, PL, SE, TR, US };

/** The flag for a currency, drawn as SVG (emoji flags do not render on Windows). */
export default function CurrencyFlag({ currency }: { currency: string }) {
  const info = CURRENCY_INFO[currency as SupportedCurrency];
  const Flag = info ? FLAGS[info.countryCode] : undefined;
  if (!Flag) return null;
  return (
    <Flag
      aria-hidden="true"
      className="h-4 w-6 shrink-0 rounded-[2px] border border-border object-cover"
    />
  );
}
