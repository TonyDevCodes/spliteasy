import type { ReactNode } from "react";
import { ArrowLeftRight, CheckCircle2, Users } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const BENEFITS = [
  { icon: Users, text: "Create groups in seconds" },
  { icon: ArrowLeftRight, text: "See who owes whom" },
  { icon: CheckCircle2, text: "Settle up with one tap" },
];

const EXAMPLE_LINES = [
  "Alex owes you €75.30",
  "Sam owes you €104.50",
  "Alex owes Sam €14.30",
];

// Shared frame for sign-in and sign-up: a brand panel on wide screens, the
// logo and slogan above the form on narrow ones.
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-shell flex min-h-screen flex-1 bg-background lg:grid lg:grid-cols-2">
      <aside className="hidden flex-col gap-10 bg-hero p-14 text-on-hero lg:flex">
        <BrandLogo layout="inline" size={72} tone="light" />

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[480px]">
            <h2 className="text-[clamp(36px,3.6vw,56px)] font-extrabold leading-[1.05] tracking-tight">
              <span className="block">Share costs.</span>
              <span className="block">Stay friends.</span>
            </h2>
            <ul className="mt-8 flex flex-col gap-4">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-lg font-medium">
                  <Icon size={24} aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>

            <div
              aria-hidden="true"
              className="mt-10 w-full max-w-[440px] -rotate-2 rounded-[20px] bg-surface p-6 text-text shadow-lg"
            >
              <p className="text-base font-semibold">Weekend in Amsterdam</p>
              <p className="mt-1 text-[28px] font-extrabold leading-tight text-success">
                You are owed €179.80
              </p>
              <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-[15px] text-text-muted">
                {EXAMPLE_LINES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[400px] flex-col gap-6 lg:max-w-[440px] lg:rounded-[20px] lg:border lg:border-border lg:bg-surface lg:p-10 lg:shadow-sm">
          <div className="lg:hidden">
            <BrandLogo tagline="Share costs. Stay friends." />
          </div>
          <h1 className="text-2xl font-extrabold text-text lg:text-[28px]">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
