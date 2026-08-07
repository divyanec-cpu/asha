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
    "Take the mock. Find out where you stand. ASHA reads your own " +
    "attempt data across every mock you log and tells you what to change next — " +
    "with the sample size behind every claim.",
  applicationName: "ASHA",
  manifest: "/manifest.webmanifest",
  // iOS ignores the manifest's `icons` array entirely and reads apple-touch-icon,
  // so both have to be declared. Without appleWebApp.capable, Add to Home Screen
  // produces a Safari bookmark rather than a fullscreen app — see
  // docs/decisions.md, "iPhone is served by the PWA".
  appleWebApp: {
    capable: true,
    title: "ASHA",
    // black-translucent lets the ink header run under the status bar, which is
    // what the design draws. The trade-off is that iOS then stops reserving
    // space for the status bar, so the app must pad for the safe area itself —
    // handled by the `pt-safe` utility in globals.css.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The ink header runs to the top of the screen; without this the status bar
  // area shows as a white band above it.
  themeColor: "#12151A",
  // Stops iOS zooming the viewport when a numeric field is focused, which
  // otherwise happens on every OTP and score input and leaves the layout
  // scrolled sideways. maximumScale rather than user-scalable:false — pinch zoom
  // stays available, which matters for anyone who needs it.
  maximumScale: 5,
  // Required for the safe-area env() values to resolve at all once
  // black-translucent removes the reserved status-bar space.
  viewportFit: "cover",
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
