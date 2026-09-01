import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default social-share card for any route that doesn't define its own
// opengraph-image — article pages override this with the article's real
// photo (see lib/seo.ts's buildArticleMetadata), so this only ever
// represents the site itself, hence the logo-centered treatment.
export default async function OpengraphImage() {
  const logoData = readFileSync(join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0b0f14",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={168} height={168} style={{ borderRadius: 28 }} />
        <div style={{ display: "flex", marginTop: 36, fontSize: 72, fontWeight: 900, color: "#ffffff" }}>
          {SITE_NAME}
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 30, color: "#9aa1ab" }}>{SITE_TAGLINE}</div>
      </div>
    ),
    { ...size },
  );
}
