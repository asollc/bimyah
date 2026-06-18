import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

import { AuthProvider } from "@/auth/AuthProvider";
import { WhitelistAckGuard } from "@/auth/WhitelistAckGuard";
import { Toaster } from "@/components/ui/sonner";
import { TransferNotifier } from "@/components/wallet/TransferNotifier";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Bimyah!" },
      { name: "google-site-verification", content: "aSTr1AVTtO7LwNjl1eQ9XrTQWabYbAh5QiydSfIg9c8" },
      {
        name: "keywords",
        content:
          "bimyah, bimyah!, cards, card game, online card game, family card game, easy card game, best card game, uno alternative, multiplayer card game",
      },
      { property: "og:site_name", content: "Bimyah!" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Bimyah!" },
      { property: "og:title", content: "Bimyah!" },
      { name: "twitter:title", content: "Bimyah!" },
      { name: "description", content: "A fast-paced card race with NO TURNS! Play for free." },
      { property: "og:description", content: "A fast-paced card race with NO TURNS! Play for free." },
      { name: "twitter:description", content: "A fast-paced card race with NO TURNS! Play for free." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/jBNVvvVpJdakQhj9xWYpnQG2fSu2/social-images/social-1779251773114-1000010544.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/jBNVvvVpJdakQhj9xWYpnQG2fSu2/social-images/social-1779251773114-1000010544.webp" },
      { name: "theme-color", content: "#0d1b2a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Bimyah!" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&family=Allura&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/favicon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app-shell">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}


function RootComponent() {
  return (
    <AuthProvider>
      <WhitelistAckGuard />
      <TransferNotifier />
      <Outlet />
      <Toaster richColors position="top-right" offset={60} style={{ zIndex: 2147483647 }} />
    </AuthProvider>
  );
}
