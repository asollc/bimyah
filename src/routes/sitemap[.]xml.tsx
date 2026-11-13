import { createFileRoute } from "@tanstack/react-router";

const SITE = "https://playbimyah.com";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const today = new Date().toISOString().split("T")[0];
        const urls = [
          { loc: `${SITE}/`, priority: "1.0", changefreq: "weekly" },
          { loc: `${SITE}/plus`, priority: "0.8", changefreq: "weekly" },
          { loc: `${SITE}/bmart`, priority: "0.7", changefreq: "weekly" },
          { loc: `${SITE}/public`, priority: "0.6", changefreq: "daily" },
        ];
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>`;
        return new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
