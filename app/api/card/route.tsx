import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

// A shareable picture: "My taste, moved to {city}" with a few matches. It is made on the fly and nothing is stored.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const city = (sp.get("city") ?? "").slice(0, 40);
  const picks = sp
    .getAll("m")
    .slice(0, 4)
    .map((x) => x.slice(0, 90).split("~") as [string, string?]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#150B2E", color: "white", padding: 56 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#FFC43D" }}>Taste Transplant</div>
          <div style={{ display: "flex", fontSize: 66, marginTop: 14 }}>{`My taste, moved to ${city}`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {picks.map(([name, seed]) => (
            <div key={name} style={{ display: "flex", fontSize: 34, marginTop: 14 }}>
              <div style={{ display: "flex", color: "#FFC43D", marginRight: 16 }}>{seed ? `Like ${seed}:` : ""}</div>
              <div style={{ display: "flex" }}>{name}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#B9AEE0" }}>Matched with Qloo taste data. taste-transplant.vercel.app</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}