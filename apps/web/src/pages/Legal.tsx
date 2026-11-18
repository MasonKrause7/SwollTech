import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export const SUPPORT_EMAIL = "support@everydaytechllc.com";
export const OPERATOR = "Everyday Tech LLC";
const UPDATED = "November 18, 2026";

export function LegalLinks() {
  return (
    <nav className="row" aria-label="Help and legal" style={{ gap: 16, flexWrap: "wrap" }}>
      <Link to="/privacy">Privacy Policy</Link>
      <Link to="/terms">Terms of Use</Link>
      <Link to="/support">Support</Link>
    </nav>
  );
}

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="page legal" style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px" }}>
      <p>
        <Link to="/">SwollTech</Link>
      </p>
      <article className="stack-lg">
        <header className="stack">
          <h1>{title}</h1>
          <p className="muted">Last updated {UPDATED}</p>
        </header>
        {children}
      </article>
      <footer style={{ marginTop: 40 }}>
        <LegalLinks />
      </footer>
    </main>
  );
}

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        SwollTech is a training notebook for the web, iPhone and Android, operated by {OPERATOR} ("we", "us"). This policy explains what we collect, why, and the
        choices you have. Questions: {mail}.
      </p>

      <section className="stack">
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account details.</strong> Your email address, an optional display name and your password. Passwords are stored only as a salted hash by our
            sign-in provider; we never see them in plain text.
          </li>
          <li>
            <strong>Workout data.</strong> The workouts you plan, the sessions and sets you log (exercises, weights, reps, RPE, notes, dates), scheduled workouts and
            reference weights, plus statistics we compute from them.
          </li>
          <li>
            <strong>No camera, microphone, photos or location.</strong> The SwollTech apps do not ask for camera and microphone access, do not read your photo
            library and do not collect your location. We do not collect videos or photos from the apps.
          </li>
          <li>
            <strong>Diagnostics.</strong> The iPhone and Android apps and the website do not include a crash-reporting or analytics SDK. When our server hits an error, it sends an
            error report to our error-monitoring service, Sentry: the error message, stack trace and server version, plus details of the request that failed (such as
            its path and the workout data it carried). The server also sends Sentry a small sample of performance timings. Sentry's option to send personal
            information is turned off, so these reports do not include your IP address, cookies or sign-in tokens.
          </li>
          <li>
            <strong>Technical logs.</strong> Our servers keep short-lived request logs (time, path, status) to keep the service secure and working.
          </li>
        </ul>
        <p>We do not use advertising identifiers, do not track you across other apps or websites, and do not use your data for advertising.</p>
      </section>

      <section className="stack">
        <h2>How we use it</h2>
        <p>
          Only to run SwollTech: to sign you in, store and sync your notebook across your devices, show your progress, keep the service secure and fix problems.
        </p>
      </section>

      <section className="stack">
        <h2>Sharing</h2>
        <p>
          <strong>We do not sell your data or share it for advertising.</strong> We use service providers that process data on our behalf to host the service: Vercel
          (application hosting), Neon (database and sign-in), Upstash (rate limiting, no personal data), and Sentry (server error reports). They may only use it to provide their service to us. We may disclose information if required by law.
        </p>
      </section>

      <section className="stack">
        <h2>Retention and deleting your account</h2>
        <p>
          We keep your data while your account is open. You can delete your account at any time in the app or on the web under <strong>Account → Delete account</strong>.
          Deleting your account immediately and permanently removes your login and your workout data. Copies in encrypted backups expire on their
          normal schedule (within about 30 days). If you cannot access the app, email {mail} from the address on the account and we will delete it for you.
        </p>
      </section>

      <section className="stack">
        <h2>Security</h2>
        <p>Data is encrypted in transit (HTTPS/TLS) and at rest by our providers. Access to your notebook requires your signed-in account.</p>
      </section>

      <section className="stack">
        <h2>Your rights</h2>
        <p>
          You can view and correct your data in the app, export it on request, and delete it as described above. Depending on where you live (for example the EU, UK or
          California) you may have additional rights to access, correct, delete or object to processing. Contact {mail} and we will respond within 30 days.
        </p>
      </section>

      <section className="stack">
        <h2>Children</h2>
        <p>SwollTech is not directed to children under 13 and we do not knowingly collect their data. If you believe a child has an account, contact us and we will delete it.</p>
      </section>

      <section className="stack">
        <h2>Changes</h2>
        <p>If we change this policy we will update the date above and, for significant changes, tell you in the app.</p>
      </section>

      <section className="stack">
        <h2>Contact</h2>
        <p>
          {OPERATOR} · {mail}
        </p>
      </section>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        These terms are an agreement between you and {OPERATOR} for your use of SwollTech. By creating an account or using the app you agree to them.
      </p>
      <section className="stack">
        <h2>Your account</h2>
        <p>
          You must be at least 13 years old. Keep your password private; you are responsible for activity on your account. You can delete your account at any time
          under Account → Delete account.
        </p>
      </section>
      <section className="stack">
        <h2>Your content</h2>
        <p>
          You own the workouts and notes you add. You give us permission to store and process them only to provide the service to you. Do not upload anything
          illegal or that you do not have the right to share.
        </p>
      </section>
      <section className="stack">
        <h2>Health and safety</h2>
        <p>
          SwollTech is a logging tool, not medical or coaching advice. Estimates such as one-rep maxes and suggested weights are calculations, not recommendations.
          Consult a qualified professional before starting a training program, and lift within your limits.
        </p>
      </section>
      <section className="stack">
        <h2>Acceptable use</h2>
        <p>Do not misuse the service: no attempts to break in, overload it, reverse engineer it, or access other people's data.</p>
      </section>
      <section className="stack">
        <h2>The service</h2>
        <p>
          SwollTech is provided "as is". We work to keep it available and your data safe but cannot promise it will be uninterrupted or error-free. To the extent the
          law allows, {OPERATOR} is not liable for indirect or consequential losses, and our total liability is limited to the amount you paid us in the last 12 months.
        </p>
      </section>
      <section className="stack">
        <h2>Changes and ending</h2>
        <p>
          We may update these terms; we will change the date above and tell you in the app about significant changes. We may suspend accounts that break these terms.
          These terms are governed by the laws of the United States and the state in which {OPERATOR} is organized.
        </p>
      </section>
      <section className="stack">
        <h2>Contact</h2>
        <p>{mail}</p>
      </section>
    </LegalPage>
  );
}

export function SupportPage() {
  return (
    <LegalPage title="Support">
      <p>Need help with SwollTech, found a bug, or want to suggest a feature? Email {mail}. We usually reply within two business days.</p>
      <section className="stack">
        <h2>Common questions</h2>
        <h3>I forgot my password</h3>
        <p>
          On the sign-in screen choose <Link to="/reset">Forgot password?</Link> and we will email you a reset link.
        </p>
        <h3>My phone and the web show different data</h3>
        <p>The phone app works offline and syncs when it is back online. Open the app with a connection and pull down to refresh.</p>
        <h3>How do I delete my account?</h3>
        <p>
          In the app or on the web open <strong>Account</strong> and use <strong>Delete account</strong>. This permanently removes your login and workouts. If you
          cannot sign in, email {mail} from your account's address.
        </p>
      </section>
      <p>
        See also the <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms of Use</Link>.
      </p>
    </LegalPage>
  );
}
