import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => {
    const title = "Terms of Service — Bimyah!";
    const description =
      "The rules for using Bimyah!: accounts, conduct, purchases, and how we handle disputes and termination.";
    const url = "https://playbimyah.com/terms";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-10 text-white">
      <Link to="/" className="text-sm text-[var(--mint)] hover:underline">
        ← Back to home
      </Link>
      <h1 className="mt-4 font-display text-4xl uppercase tracking-wider text-[var(--gold)]">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-white/60">Last updated: June 18, 2026</p>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">1. Acceptance</h2>
        <p className="text-white/80">
          By creating an account or playing Bimyah!, you agree to these Terms and our{" "}
          <Link to="/privacy" className="text-[var(--mint)] underline">
            Privacy Policy
          </Link>
          . If you don't agree, don't use the service.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">2. Your account</h2>
        <ul className="list-disc space-y-2 pl-6 text-white/80">
          <li>You must be at least 13 years old to create an account.</li>
          <li>You are responsible for keeping your password safe.</li>
          <li>Display names are permanent and must not impersonate others or be offensive.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">3. Acceptable use</h2>
        <p className="text-white/80">You agree not to:</p>
        <ul className="list-disc space-y-2 pl-6 text-white/80">
          <li>Harass, threaten, or harm other players.</li>
          <li>Post hateful, sexual, violent, or illegal content in chat or custom cards.</li>
          <li>Cheat, exploit bugs, automate gameplay, or interfere with other players' matches.</li>
          <li>Reverse engineer, scrape, or resell the service.</li>
        </ul>
        <p className="text-white/80">
          We may remove content, suspend, or terminate accounts that violate these rules.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">4. User content</h2>
        <p className="text-white/80">
          Chat messages, custom cards, and other content you submit remain yours, but you grant us
          a worldwide license to host, display, and moderate that content as needed to run the
          game. You can report or block other users from in-game UI.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">5. Purchases &amp; virtual items</h2>
        <ul className="list-disc space-y-2 pl-6 text-white/80">
          <li>
            Bimyah!+, Bimbucks, Bimbits, and cosmetics are licensed to you for personal,
            non-transferable use within the game. They have no real-world cash value.
          </li>
          <li>
            Subscriptions renew until cancelled. Cancel any time from your account or via the
            payment provider.
          </li>
          <li>Refunds follow the rules of the payment provider (Stripe, PayPal, Google Play).</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">6. Termination</h2>
        <p className="text-white/80">
          You can delete your account at any time from{" "}
          <Link to="/profile" className="text-[var(--mint)] underline">
            Profile → Delete Account
          </Link>
          . We may suspend or terminate accounts for violations of these Terms or to comply with
          law.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">7. Disclaimers</h2>
        <p className="text-white/80">
          The service is provided “as is” without warranties of any kind. We do not guarantee the
          service will be uninterrupted or error-free.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">8. Contact</h2>
        <p className="text-white/80">
          Questions? Email{" "}
          <a className="text-[var(--mint)] underline" href="mailto:support@playbimyah.com">
            support@playbimyah.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
