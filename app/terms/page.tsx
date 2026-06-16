"use client";

import { SettingsScreen, SettingsHeader, Body } from "../settings/shared";

const LAST_UPDATED = "17 June 2026";
const CONTACT_EMAIL = "support@foopy.app";

export default function TermsOfService() {
  return (
    <SettingsScreen>
      <SettingsHeader title="Terms of Service" />
      <Body>
        <style>{`
          .legal { padding: 4px 4px 0; }
          .legal h2 { font-size: 16px; font-weight: 800; color: var(--text-1); margin: 26px 0 8px; letter-spacing: -0.01em; }
          .legal p, .legal li { font-size: 14px; line-height: 1.65; color: var(--text-2); font-weight: 500; margin: 0 0 10px; }
          .legal ul { margin: 0 0 10px; padding-left: 20px; }
          .legal li { margin-bottom: 6px; }
          .legal .muted { font-size: 12.5px; color: var(--text-3); }
          .legal strong { color: var(--text-1); font-weight: 700; }
          .legal a { color: #60a5fa; text-decoration: none; }
        `}</style>
        <div className="legal">
          <p className="muted">Last updated: {LAST_UPDATED}</p>

          <p>
            Welcome to Foopy. By creating an account or using the app, you agree to these
            Terms of Service (&ldquo;Terms&rdquo;). If you don&rsquo;t agree, please don&rsquo;t use Foopy.
          </p>

          <h2>Eligibility</h2>
          <p>
            You must be at least 13 years old to use Foopy. By using the app you confirm
            that you meet this requirement and that the information you provide is accurate.
          </p>

          <h2>Your account</h2>
          <p>
            You&rsquo;re responsible for keeping your login details secure and for all activity
            that happens under your account. Let us know right away if you think your
            account has been compromised. You can delete your account at any time in{" "}
            <strong>Settings → Account</strong>.
          </p>

          <h2>Acceptable use &amp; objectionable content</h2>
          <p>
            Foopy lets you post content and interact with others. We have a{" "}
            <strong>zero-tolerance policy for objectionable content and abusive behaviour.</strong>{" "}
            You agree not to post, send or share content that is:
          </p>
          <ul>
            <li>harassing, bullying, threatening or hateful;</li>
            <li>sexually explicit, obscene, or otherwise inappropriate;</li>
            <li>violent, illegal, or that promotes harm;</li>
            <li>spam, scams, impersonation, or misleading content;</li>
            <li>infringing on someone else&rsquo;s rights.</li>
          </ul>
          <p>
            You can <strong>report</strong> content or <strong>block</strong> any user from the
            menu next to their content or on their profile. We review reports and may remove
            content and suspend or ban users who violate these Terms, without notice. We aim
            to act on reports of objectionable content within 24 hours.
          </p>

          <h2>Your content</h2>
          <p>
            You keep ownership of the content you create, but you grant Foopy a
            non-exclusive licence to host, display and distribute it within the app so we
            can provide the service. You&rsquo;re responsible for the content you post and
            confirm you have the right to share it.
          </p>

          <h2>Virtual items and in-app currency</h2>
          <p>
            Foopy includes virtual items such as coins, aura, tokens, cards and cosmetics.
            These have <strong>no real-world monetary value</strong>, cannot be exchanged for
            cash, and are licensed to you for use within the app only. We may change,
            adjust, expire or remove virtual items at any time. Predictions, picks and duels
            are for entertainment and do not involve real-money wagering.
          </p>

          <h2>Intellectual property</h2>
          <p>
            Foopy is an unofficial, fan-made app and is <strong>not affiliated with, endorsed
            by, or associated with the Australian Football League (AFL), the AFL Players&rsquo;
            Association, or any AFL club.</strong> All team names, logos, player names and
            related marks are the property of their respective owners.
          </p>

          <h2>Disclaimer</h2>
          <p>
            Foopy is provided &ldquo;as is&rdquo; without warranties of any kind. Scores,
            stats and ratings are provided for information and entertainment and may not be
            accurate or up to date. To the fullest extent permitted by law, Foopy is not
            liable for any loss or damage arising from your use of the app.
          </p>

          <h2>Termination</h2>
          <p>
            We may suspend or terminate your access to Foopy if you breach these Terms or
            misuse the app. You may stop using Foopy and delete your account at any time.
          </p>

          <h2>Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. We&rsquo;ll revise the &ldquo;last
            updated&rdquo; date above, and continued use of the app means you accept the
            updated Terms.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these Terms? Email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>
      </Body>
    </SettingsScreen>
  );
}
