import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config — REMOTE-URL MODE, mirroring Dhruva.
 *
 * The Android app is a thin shell: its WebView loads the deployed site directly,
 * so every Vercel deploy updates the app with no reinstall and no store review.
 * `webDir` is a placeholder Capacitor insists on even in remote-URL mode — see
 * www/index.html, which is never served.
 *
 * Do NOT switch this to a bundled static export. A static build would break the
 * server-side MSG91 token verification and the /api routes that mint the OTP
 * session and delete accounts, all of which need a server. See
 * docs/architecture.md, "How the Android app works".
 *
 * THE URL COMES FROM THE ENVIRONMENT, deliberately, because it differs per
 * deployment and a hardcoded one is how you ship an APK pointing at someone
 * else's site — or at localhost, which silently produces an app that shows
 * nothing on every device but the build machine.
 *
 *   ASHA_APP_URL=https://asha-dev.vercel.app npx cap sync android
 *
 * If it's unset, the config still loads (so `cap add android` and other
 * scaffolding commands work before a deployment exists) but points at an
 * obviously-invalid host and warns loudly, so a mis-built APK fails visibly
 * rather than looking like a network problem.
 */

const APP_URL = process.env.ASHA_APP_URL?.trim();

if (!APP_URL) {
  console.warn(
    "\n  [capacitor] ASHA_APP_URL is not set.\n" +
      "  Scaffolding commands will work, but any APK built now will not load.\n" +
      "  Set it to the deployed site before `cap sync`:\n" +
      "      ASHA_APP_URL=https://your-deployment.vercel.app npx cap sync android\n",
  );
}

const config: CapacitorConfig = {
  appId: "com.asha.app",
  appName: "ASHA",
  webDir: "www",
  server: {
    url: APP_URL ?? "https://asha-app-url-not-configured.invalid",
    // The site is HTTPS, so the WebView must use the https scheme too — mixing
    // them trips Android's mixed-content blocking and the page silently fails.
    androidScheme: "https",
  },
  android: {
    // The design is a portrait phone app throughout; nothing is laid out for
    // landscape, and letting it rotate would just present a broken layout.
    // (Also enforced in the manifest, which is what actually locks it.)
    allowMixedContent: false,
  },
};

export default config;
