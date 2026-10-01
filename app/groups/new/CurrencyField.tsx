"use client";

import { useState } from "react";
import CurrencyPicker from "@/components/CurrencyPicker";
import { DEFAULT_CURRENCY } from "@/lib/money";

/** Currency choice for the create-group form; submitted as the "currency" field. */
export default function CurrencyField() {
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  return <CurrencyPicker id="currency" name="currency" value={currency} onChange={setCurrency} />;
}
