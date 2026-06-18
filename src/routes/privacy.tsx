import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => {
    const title = "Privacy Policy — Bimyah!";
    const description =
      "How Bimyah! collects, uses, stores, and protects your information, and how you can request account deletion.";
    const url = "https://playbimyah.com/privacy";
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
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-10 text-white">
      <Link to="/" className="text-sm text-[var(--mint)] hover:underline">
        ← Back to home
      </Link>
      <h1 className="mt-4 font-display text-4xl uppercase tracking-wider text-[var(--gold)]">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-white/60">Last updated: June 18, 2026</p>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">1. Who we are</h2>
        <p className="text-white/80">
          Bimyah! (“we”, “us”, “our”) operates the Bimyah! card game website and apps available at
          playbimyah.com. This policy explains what we collect, why, and your choices.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">2. Information we collect</h2>
        <ul className="list-disc space-y-2 pl-6 text-white/80">
          <li>
            <strong>Account info:</strong> email address, password (hashed), and a display name you
            choose at signup.
          </li>
          <li>
            <strong>Profile &amp; cosmetics:</strong> avatar, selected card backs, backgrounds, and
            other in-game cosmetic choices.
          </li>
          <li>
            <strong>Gameplay data:</strong> match results, wallet balances (Bimbucks / Bimbits),
            friends list, chat messages, and public match activity.
          </li>
          <li>
            <strong>Purchases:</strong> if you buy Bimyah!+ or items through Stripe or PayPal, the
            payment processor collects payment details. We store only the transaction reference and
            entitlement.
          </li>
          <li>
            <strong>Device &amp; usage:</strong> basic logs (IP, browser, timestamps) for security
            and anti-abuse purposes.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">3. How we use it</h2>
        <ul className="list-disc space-y-2 pl-6 text-white/80">
          <li>To run your account, matches, friends, chat, and wallet.</li>
          <li>To send essential transactional emails (invites, password resets, receipts).</li>
          <li>To detect abuse, cheating, and policy violations.</li>
          <li>To improve the game and fix bugs.</li>
        </ul>
        <p className="text-white/80">
          We do not sell your personal information.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">4. Sharing</h2>
        <p className="text-white/80">
          We share data only with service providers needed to run the game (hosting, database,
          email delivery, payments). These providers are bound by their own privacy and security
          terms.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">5. Your choices</h2>
        <ul className="list-disc space-y-2 pl-6 text-white/80">
          <li>You can update your avatar and cosmetics from your Profile page.</li>
          <li>You can unsubscribe from non-essential emails using the link in any email.</li>
          <li>
            You can <strong>delete your account</strong> at any time from{" "}
            <Link to="/profile" className="text-[var(--mint)] underline">
              Profile → Delete Account
            </Link>
            , or by emailing{" "}
            <a className="text-[var(--mint)] underline" href="mailto:support@playbimyah.com">
              support@playbimyah.com
            </a>
            . Deletion removes your profile, cosmetics, wallet balances, friends, and chat messages.
            Some records (e.g. fraud or payment logs) may be retained as required by law.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">6. Children</h2>
        <p className="text-white/80">
          Bimyah! is not directed at children under 13. If you believe a child has created an
          account, contact us and we will remove it.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl uppercase text-white">7. Contact</h2>
        <p className="text-white/80">
          Questions or requests? Email{" "}
          <a className="text-[var(--mint)] underline" href="mailto:support@playbimyah.com">
            support@playbimyah.com
          </a>
          .
        </p>
      </section>

      <div className="mt-10 text-sm text-white/60">
        See also our{" "}
        <Link to="/terms" className="text-[var(--mint)] underline">
          Terms of Service
        </Link>
        .
      </div>
    </div>
  );
}
