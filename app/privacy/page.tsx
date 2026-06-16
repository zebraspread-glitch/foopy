"use client";

import { SettingsScreen, SettingsHeader, Body } from "../settings/shared";

const LAST_UPDATED = "17 June 2026";
const CONTACT_EMAIL = "support@foopy.app";

export default function PrivacyPolicy() {
  return (
    <SettingsScreen>
      <SettingsHeader title="Privacy Policy" />
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
            Foopy (&ldquo;Foopy&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an unofficial,
            fan-made app for AFL scores, stats, ratings and predictions. This Privacy
            Policy explains what information we collect, how we use it, and the choices
            you have. By using Foopy you agree to this policy.
          </p>

          <h2>Information we collect</h2>
          <ul>
            <li><strong>Account information</strong> — your email address and password (handled by our authentication provider), and the username and display name you choose.</li>
            <li><strong>Profile content</strong> — your avatar, banner, favourite team, and any cosmetic items you equip.</li>
            <li><strong>Content you create</strong> — direct messages, group chats, comments, poll responses, predictions and other content you post in the app.</li>
            <li><strong>Activity data</strong> — your in-app balances (coins, aura, tokens), cards collected, and your interactions such as picks, duels and reactions.</li>
            <li><strong>Technical data</strong> — basic device and usage information collected automatically to keep the app running and to understand performance.</li>
          </ul>

          <h2>How we use your information</h2>
          <ul>
            <li>To create and secure your account and sign you in.</li>
            <li>To provide core features — profiles, leaderboards, messaging, predictions and the in-app economy.</li>
            <li>To moderate content and enforce our Terms of Service, including acting on reports.</li>
            <li>To maintain, troubleshoot and improve the app.</li>
          </ul>

          <h2>What other people can see</h2>
          <p>
            Some information is public by design: your username, display name, avatar,
            favourite team, profile, and your position on leaderboards are visible to
            other users. Content you post in shared spaces (group chats, comments, polls)
            is visible to other participants. Please don&rsquo;t share anything you want to
            keep private.
          </p>

          <h2>How we share information</h2>
          <p>
            We do <strong>not</strong> sell your personal information. We share data only with
            service providers that help us operate Foopy — for example, our backend,
            authentication, database and file-storage provider (Supabase) and our hosting
            and analytics provider (Vercel) — and only as needed to run the app. We may
            also disclose information if required by law or to protect the safety of our
            users.
          </p>

          <h2>AFL data</h2>
          <p>
            Match scores, fixtures and player statistics are sourced from publicly
            available feeds. This information is about games and players, not about you.
          </p>

          <h2>Data retention and deletion</h2>
          <p>
            We keep your information for as long as your account is active. You can delete
            your account at any time in <strong>Settings → Account</strong>. Deleting your
            account removes your profile and associated personal data; some content may be
            retained in anonymised or aggregated form, or where we are required to keep it.
          </p>

          <h2>Security</h2>
          <p>
            We take reasonable measures to protect your information, but no method of
            transmission or storage is completely secure, and we cannot guarantee absolute
            security.
          </p>

          <h2>Children</h2>
          <p>
            Foopy is not directed at children under 13, and we do not knowingly collect
            personal information from them. If you believe a child has provided us with
            personal information, please contact us so we can remove it.
          </p>

          <h2>Your choices</h2>
          <p>
            You can review and update your profile information in the app, and delete your
            account at any time. To make any other request about your personal data,
            contact us at the email below.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We may update this policy from time to time. We&rsquo;ll revise the &ldquo;last
            updated&rdquo; date above when we do, and significant changes will be made
            clear in the app.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy? Email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <p className="muted" style={{ marginTop: 18 }}>
            Foopy is an unofficial fan-made app and is not affiliated with, endorsed by, or
            associated with the Australian Football League (AFL), the AFL Players&rsquo;
            Association, or any AFL club.
          </p>
        </div>
      </Body>
    </SettingsScreen>
  );
}
