import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

/*
  next/font downloads both faces at build time and serves them from our own
  origin. That is what satisfies the rule in CLAUDE.md that the app must not
  depend on Google Fonts at runtime — it matters for the Android APK and for
  the installed PWA, neither of which should need a third-party host to render
  text.
*/
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ASHA",
  description:
    "You've taken the mock. Now find out where you stand. ASHA reads your own " +
    "attempt data across every mock you log and tells you what to change next — " +
    "with the sample size behind every claim.",
  applicationName: "ASHA",
  // iOS ignores most of manifest.json, so the home-screen behaviour is driven by
  // these Apple-specific values. Without appleWebApp.capable, Add to Home Screen
  // produces a Safari bookmark rather than a fullscreen app. See
  // docs/decisions.md, "iPhone is served by the PWA".
  appleWebApp: {
    capable: true,
    title: "ASHA",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The ink header runs to the top of the screen; without this the status bar
  // area shows as a white band above it.
  themeColor: "#12151A",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${instrumentSans.variable} ${ibmPlexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
