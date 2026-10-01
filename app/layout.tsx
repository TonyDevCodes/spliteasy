import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { themeCss, themeInitScript } from "@/lib/theme";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "SplitEasy",
  description: "Share costs. Stay friends.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by themeInitScript before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
