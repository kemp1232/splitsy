import { Hono } from 'hono';

// Public, self-contained HTML pages the Play Store listing links to
// (2026-11-09 spec Amendment): the privacy policy and a web account-deletion
// page. No external scripts, styles, or fonts — everything is inline, and the
// deletion page only talks to this same origin's own /api/auth/* endpoints.

export const pagesRoute = new Hono();

const STYLE = `
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.5;
    max-width: 42rem; margin: 0 auto; padding: 1.5rem; color: #1a1a1a; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 1.75rem; }
  label { display: block; margin-top: 1rem; font-weight: 600; }
  input { width: 100%; box-sizing: border-box; padding: 0.6rem; font-size: 1rem; margin-top: 0.25rem; }
  button { margin-top: 1.25rem; padding: 0.7rem 1.2rem; font-size: 1rem; background: #c62828;
    color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  button.secondary { background: #1a1a1a; margin-top: 0; }
  [hidden] { display: none; }
  .todo { background: #fff3cd; padding: 0.1rem 0.3rem; }
  #result { margin-top: 1rem; font-weight: 600; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

const PRIVACY_HTML = page(
  'Splitsy Privacy Policy',
  `<h1>Splitsy Privacy Policy</h1>
<p>Last updated: 2026-11-09</p>
<p>Splitsy is a bill-splitting app. This policy explains what data Splitsy handles and why.</p>

<h2>Your account</h2>
<p>To use Splitsy you create an account with your name, email address, and password. These are
stored on Splitsy's server (a Postgres database hosted by Neon) using the Better Auth sign-in
system. Passwords are stored only as a secure hash. The server also keeps sign-in sessions so you
stay signed in.</p>

<h2>Camera and photos</h2>
<p>Splitsy uses your camera, or a photo you choose, only to capture a receipt. Receipt photos are
saved on your device.</p>

<h2>Receipt scanning</h2>
<p>When you scan a receipt online, the photo is sent over an encrypted connection to Splitsy's
server, which forwards it to Groq, a third-party AI provider, to read the items and prices.
Splitsy's server does not store the photo or the text read from it; it is held in memory only for
that one request. Groq processes the photo under its own terms and retention policy, which Splitsy
does not control. If online scanning is unavailable, the app can read the receipt on your device
instead.</p>

<h2>Daily scan counter</h2>
<p>To keep online scanning affordable, Splitsy's server keeps a count of how many receipts each
account has scanned on each day (UTC), to enforce a daily limit. This counter contains only your
account ID, the date, and the number of scans.</p>

<h2>Your bills</h2>
<p>Bills, trips, participants, items, and payments are stored only on your device. They are not
uploaded to Splitsy's server or synced anywhere.</p>

<h2>Emails</h2>
<p>Splitsy sends account emails (email verification and password reset) through Resend, an email
delivery provider, which receives your email address for that purpose.</p>

<h2>Sharing</h2>
<p>Splitsy does not sell your data or use it for advertising. Data is shared only with the
providers named above (Neon, Groq, Resend, and the server host), only to run the app. All data
is sent over encrypted (HTTPS) connections.</p>

<h2>Deleting your account</h2>
<p>You can delete your account at any time:</p>
<ul>
<li>In the app: Settings &rarr; Delete account.</li>
<li>On the web: <a href="/delete-account">the account deletion page</a>.</li>
</ul>
<p>Deleting your account permanently removes your account, sign-in sessions, and daily scan
counter from Splitsy's server. Deleting from the app also removes the bills stored on that device.
Bills on other devices stay there until you delete them or uninstall the app.</p>

<h2>Contact</h2>
<p><span class="todo">TODO: add a contact email address before publishing.</span></p>`,
);

// The deletion page's own script. Uses textContent (never innerHTML) for all
// output, and never logs the password.
const DELETE_SCRIPT = `
(function () {
  var form = document.getElementById('delete-form');
  var result = document.getElementById('result');
  var button = document.getElementById('submit');
  var verifyButton = document.getElementById('verify');
  var pendingEmail = '';
  function show(message, ok) {
    result.textContent = message;
    result.style.color = ok ? '#2e7d32' : '#c62828';
  }
  verifyButton.addEventListener('click', async function () {
    if (!pendingEmail) return;
    verifyButton.disabled = true;
    try {
      var sent = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: pendingEmail, callbackURL: '/delete-account' })
      });
      if (sent.ok) {
        verifyButton.hidden = true;
        show('Verification email sent. Open the link in it, then come back to this page and delete your account.', true);
      } else if (sent.status === 429) {
        show('Too many attempts. Wait a few minutes, then try again.', false);
      } else {
        show('We could not send the verification email. Please try again.', false);
      }
    } catch (error) {
      show('Network error. Check your connection and try again.', false);
    } finally {
      verifyButton.disabled = false;
    }
  });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;
    if (!email || !password) { show('Enter your email and password.', false); return; }
    verifyButton.hidden = true;
    button.disabled = true;
    show('Deleting your account...', true);
    try {
      var signIn = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email, password: password })
      });
      if (!signIn.ok) {
        var signInBody = await signIn.json().catch(function () { return {}; });
        var code = signInBody && signInBody.code;
        if (code === 'EMAIL_NOT_VERIFIED') {
          // Unverified accounts can't sign in, so they can't be deleted here
          // until the email is verified — offer a link that lands back here.
          pendingEmail = email;
          verifyButton.hidden = false;
          show('Your email is not verified yet. Send a verification email, open the link, then come back to this page.', false);
        } else if (signIn.status === 401 || code === 'INVALID_EMAIL_OR_PASSWORD') {
          show('Email or password is incorrect.', false);
        } else if (signIn.status === 429) {
          show('Too many attempts. Wait a few minutes, then try again.', false);
        } else {
          show('Something went wrong. Please try again.', false);
        }
        return;
      }
      var del = await fetch('/api/auth/delete-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: password })
      });
      if (!del.ok) {
        // Don't leave a live session behind in this browser (best effort).
        await fetch('/api/auth/sign-out', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: '{}'
        }).catch(function () {});
        show('We could not delete your account. Please try again later.', false);
        return;
      }
      form.reset();
      show('Your Splitsy account has been deleted.', true);
    } catch (error) {
      show('Network error. Check your connection and try again.', false);
    } finally {
      button.disabled = false;
    }
  });
})();
`;

const DELETE_ACCOUNT_HTML = page(
  'Delete your Splitsy account',
  `<h1>Delete your Splitsy account</h1>
<p>Enter the email and password of the Splitsy account you want to delete. This permanently
deletes your account, sign-in sessions, and daily scan counter from Splitsy's server. It cannot
be undone.</p>
<p>Bills are stored only on your devices. To remove them, use Settings &rarr; Delete all local data
in the app, or uninstall it. You can also delete your account from inside the app:
Settings &rarr; Delete account.</p>
<form id="delete-form" novalidate>
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button id="submit" type="submit">Delete my account</button>
</form>
<p id="result" role="status" aria-live="polite"></p>
<button id="verify" type="button" class="secondary" hidden>Send verification email</button>
<p><a href="/privacy">Privacy policy</a></p>
<script>${DELETE_SCRIPT}</script>`,
);

pagesRoute.get('/privacy', (c) => c.html(PRIVACY_HTML));
pagesRoute.get('/delete-account', (c) => c.html(DELETE_ACCOUNT_HTML));
