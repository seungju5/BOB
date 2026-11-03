import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "밥뭇나",
    short_name: "밥뭇나",
    description: "밥 한 끼로 전하는 안부",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdf7",
    theme_color: "#f8d14a",
    lang: "ko",
    icons: [{ src: "/brand/rice-logo.png", sizes: "1254x1254", type: "image/png", purpose: "any" }],
  };
}
