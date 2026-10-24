import { createMiddleware, createStart } from "@tanstack/react-start";

/* Page documents must always revalidate. Without this, browsers (notably
   Chrome on Android) heuristically cache the HTML shell and phones keep
   showing an old build for hours after a deploy. Only HTML responses are
   touched; server-function calls and hashed assets pass through as-is. */
const htmlNoCache = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    const result = await next();
    const contentType = result.response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      result.response.headers.set("Cache-Control", "no-cache");
    }
    return result;
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [htmlNoCache],
}));
