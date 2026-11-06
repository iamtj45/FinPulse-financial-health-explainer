import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "./components/ThemeToggle";

/** Applies a remembered theme before the browser paints.
 *
 * This has to be a blocking inline script in <head>. React runs after the
 * first paint, so doing it in a component would show the system theme for
 * a frame first — a white flash for anyone who chose dark. */
const THEME_SCRIPT = `try{var m=localStorage.getItem("theme");if(m==="light"||m==="dark"){document.documentElement.setAttribute("data-theme",m)}}catch(e){}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FinPulse — company financial health explainer",
  description:
    "Enter a US-listed ticker and get standard financial ratios computed from real filings, a three-year trend, and a plain-English explanation. Educational tool. Not investment advice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
