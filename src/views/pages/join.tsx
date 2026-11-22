import { h, type Html } from '../jsx.js';
import type { PageContext } from '../context.js';
import type { ActiveInvite } from '../../repositories/invites.js';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../../labels.js';
import { initials } from '../../view-helpers.js';
import { Document, Tile } from '../partials/common.js';
import { Icon } from '../partials/icon.js';

const LONG_DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const;

/** The page behind an invite link: join (signed in), sign up / sign in (signed out), or "expired". */
export function JoinPage({ ctx, invite, token }: { ctx: PageContext; invite: ActiveInvite | null; token: string | null }): Html {
  const { user } = ctx;
  return (
    <Document title={invite ? `Join ${invite.org_name}` : 'Invite link expired'}>
      <div class="page">
        <header class="app-header">
          <div class="app-header-inner">
            <a class="brand" href="/"><Icon name="logo" size={22} />DAPS Tracker</a>
            <div class="header-spacer"></div>
            {user ? <div class="header-user"><span class="avatar sm" aria-hidden="true">{initials(user.name)}</span><span class="who">{user.name}</span></div> : null}
          </div>
        </header>

        <main class="main centered">
          {invite ? (
            <section class="card join-card" aria-labelledby="join-h">
              <div class="join-head">
                <Tile name={invite.org_name} size={56} />
                <p class="muted">{invite.inviter_name ?? 'An admin'} invited you to join</p>
                <h1 id="join-h">{invite.org_name}</h1>
                <p class="as">as <span class="badge-plain">{ROLE_LABEL[invite.role]}</span></p>
              </div>

              <div class="explainer">{ROLE_DESCRIPTION[invite.role]}</div>

              {user ? (
                <div class="form-stack">
                  <form method="post" action={`/join/${token}`}><button type="submit" class="btn btn-primary btn-block">Join {invite.org_name}</button></form>
                  <form method="post" action="/logout" class="center-note">
                    <input type="hidden" name="invite" value={token} />
                    {' '}Signed in as {user.email}. <button type="submit" class="link-btn">Use another account</button>
                  </form>
                </div>
              ) : (
                <div class="form-stack">
                  <a class="btn btn-primary" href={`/register?invite=${token}`}>Create account and join</a>
                  <a class="btn btn-secondary" href={`/login?invite=${token}`}>I already have an account</a>
                </div>
              )}

              <p class="center-note">This link works once and expires on {new Date(invite.expires_at).toLocaleDateString('en-GB', LONG_DATE)}.</p>
            </section>
          ) : (
            <section class="message-block" aria-labelledby="bad-h">
              <span class="icon-chip muted lg" aria-hidden="true"><Icon name="link-broken" size={26} /></span>
              <h1 id="bad-h">This invite link is invalid or has expired</h1>
              <p>Each link works once, for 7 days. Ask an admin of the organization to send you a new one.</p>
              <a class="btn btn-secondary" href="/">Go to DAPS Tracker</a>
            </section>
          )}
        </main>
      </div>
    </Document>
  );
}
