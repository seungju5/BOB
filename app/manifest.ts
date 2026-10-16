import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "밥뭇나",
    short_name: "밥뭇나",
    description: "밥 한 끼로 전하는 안부",
    start_url: "/",
    display: "standalone",
    background_color: "#fffcf3",
    theme_color: "#f6cd48",
    lang: "ko",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
