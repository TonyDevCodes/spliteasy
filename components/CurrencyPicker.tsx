"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { CURRENCY_INFO, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/money";
import CurrencyFlag from "./CurrencyFlag";

type Props = {
  value: string;
  onChange: (currency: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
};

/** Accessible currency dropdown: flag + code button, listbox panel with names. */
export default function CurrencyPicker({ value, onChange, id, name, disabled, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function openList() {
    const index = SUPPORTED_CURRENCIES.indexOf(value as SupportedCurrency);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function select(currency: string) {
    close();
    if (currency !== value) onChange(currency);
  }

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openList();
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    const last = SUPPORTED_CURRENCIES.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(i + 1, last));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        select(SUPPORTED_CURRENCIES[active]);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKeyDown}
        className="flex h-9 w-full items-center gap-2 whitespace-nowrap rounded-md border border-border bg-input-background px-3 text-sm font-medium text-text hover:bg-surface-hover disabled:bg-disabled disabled:text-on-disabled"
      >
        <CurrencyFlag currency={value} />
        <span>{value}</span>
        <ChevronDown size={16} aria-hidden="true" className="ml-auto text-text-muted" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="Currency"
          aria-activedescendant={`${listId}-${SUPPORTED_CURRENCIES[active]}`}
          onKeyDown={onListKeyDown}
          className="absolute left-0 z-20 mt-1 max-h-72 w-64 overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg outline-none"
        >
          {SUPPORTED_CURRENCIES.map((c, i) => (
            <li
              key={c}
              id={`${listId}-${c}`}
              role="option"
              aria-selected={c === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => select(c)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text ${
                i === active ? "bg-surface-hover" : ""
              }`}
            >
              <CurrencyFlag currency={c} />
              <span className="font-medium">{c}</span>
              <span className="truncate text-text-muted">{CURRENCY_INFO[c].name}</span>
              {c === value && <Check size={16} aria-hidden="true" className="ml-auto shrink-0 text-primary" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
