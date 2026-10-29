import { createRouter, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { routeTree } from "./routeTree.gen";
import { reportBugToSupport } from "@/lib/rpc/support.functions";

type ReportState = "idle" | "sending" | "sent" | "error";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);
  const [reportState, setReportState] = useState<ReportState>("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const timestamp = new Date().toISOString();
  const routePath =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "";

  async function handleReportToSupport() {
    if (reportState === "sending" || reportState === "sent") return;
    setReportState("sending");
    setReportError(null);
    try {
      await reportBugToSupport({
        data: {
          route: routePath || null,
          errorName: error.name || null,
          errorMessage: error.message || null,
          errorStack: error.stack ?? null,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
      setReportState("sent");
    } catch (e) {
      setReportState("error");
      setReportError((e as Error).message ?? "Failed to send report.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-3 text-left">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {showDetails ? "Hide error details" : "Show error details"}
          </button>
          {showDetails && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
              {`Time: ${timestamp}\nRoute: ${routePath}\n\n${error.name}: ${error.message}${
                error.stack ? `\n\n${error.stack}` : ""
              }`}
            </pre>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
          <button
            type="button"
            onClick={() => void handleReportToSupport()}
            disabled={reportState === "sending" || reportState === "sent"}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reportState === "sending"
              ? "Sending..."
              : reportState === "sent"
                ? "Report sent"
                : "Report to Support"}
          </button>
        </div>
        {reportState === "sent" && (
          <p className="mt-3 text-sm text-muted-foreground">
            Report sent. Support has been notified.
          </p>
        )}
        {reportState === "error" && reportError && (
          <p className="mt-3 text-sm text-destructive">Could not send report: {reportError}</p>
        )}
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
