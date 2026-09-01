import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_DESCRIPTION, siteUrl } from "@/lib/constants";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo";
import { getThemePreference } from "@/lib/theme";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} — ${SITE_DESCRIPTION.split(" — ")[0]}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read server-side and stamped straight into the initial HTML so the
  // correct theme is there from the very first paint — no flash of the
  // wrong theme while client JS loads. "system" leaves the attribute off
  // entirely and app/globals.css falls back to prefers-color-scheme.
  const themePreference = await getThemePreference();

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable}`}
      data-theme={themePreference === "system" ? undefined : themePreference}
    >
      <body className="min-h-screen bg-paper text-ink antialiased">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              websiteJsonLd(),
              { "@context": "https://schema.org", ...organizationJsonLd() },
            ]),
          }}
        />
        {children}
      </body>
    </html>
  );
}
