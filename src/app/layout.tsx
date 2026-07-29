import type { Metadata, Viewport } from "next";

// Fonts come from Fontsource (npm), NOT next/font/google.
//
// WHY, because it looks like the fussier choice and isn't: next/font/google
// downloads the .woff2 files from fonts.gstatic.com AT BUILD TIME. Any
// environment without egress to Google — this sandbox, an air-gapped CI, a
// restricted corporate network — fails the build outright. It cost a 500 on
// every page here before it was caught.
//
// Fontsource ships the same font files as npm packages, so they are pinned in
// package-lock.json, bundled by the build, and served from our own origin. That
// is what CLAUDE.md's "self-host both" rule was actually asking for: no runtime
// Google dependency for the APK or the installed PWA, AND no build-time one.
//
// Only the weights actually used are imported — Instrument Sans as a variable
// font (it covers 400-700 in one file), IBM Plex Mono at the three weights the
// design uses.
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASHA",
  description:
    "You've taken the mock. Now find out where you stand. ASHA reads your own " +
    "attempt data across every mock you log and tells you what to change next — " +
    "with the sample size behind every claim.",
  applicationName: "ASHA",
  // iOS ignores most of manifest.json, so home-screen behaviour is driven by
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
      <body>{children}</body>
    </html>
  );
}
