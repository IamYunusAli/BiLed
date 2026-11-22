import { h, Fragment, type Html } from '../jsx.js';
import { text, type PageContext } from '../context.js';
import type { Role } from '../../domain.js';
import { ROLE_LABEL } from '../../labels.js';
import { Document, FieldError, Notices, Tile, invalidAttrs } from '../partials/common.js';
import { Icon } from '../partials/icon.js';

/** The invite a visitor arrived with (from ?invite=), carried through sign-in or sign-up. */
export interface InviteContext {
  token: string;
  orgName: string;
  role: Role;
}

function InviteNotice({ invite, after }: { invite: InviteContext; after: string }): Html {
  return (
    <>
      <div class="notice notice-info" role="status">
        <Tile name={invite.orgName} size={32} />
        <span>{after}, you'll join <strong>{invite.orgName}</strong> as {ROLE_LABEL[invite.role]}.</span>
      </div>
      <input type="hidden" name="invite" value={invite.token} />
    </>
  );
}

const inviteQuery = (invite: InviteContext | null): string => (invite ? '?invite=' + invite.token : '');

export function LoginPage({ ctx, invite }: { ctx: PageContext; invite: InviteContext | null }): Html {
  const { errors, values } = ctx;
  return (
    <Document title="Sign in">
      <div class="auth-page">
        <div class="auth-head">
          <Icon name="logo" size={40} />
          <h1>Sign in to DAPS Tracker</h1>
          <p>Projects, tasks and ETB budgets for every organization you belong to.</p>
        </div>

        <form method="post" action="/login" class="auth-card" novalidate>
          <Notices ctx={ctx} />
          {invite ? <InviteNotice invite={invite} after="After you sign in" /> : null}
          <div class={`field${errors.email ? ' invalid' : ''}`}>
            <label for="l-email">Email</label>
            <input class="input" id="l-email" name="email" type="email" autocomplete="email" required value={text(values.email)} {...invalidAttrs(errors, 'email', 'l-email')} />
            <FieldError errors={errors} name="email" id="l-email" />
          </div>
          <div class={`field${errors.password ? ' invalid' : ''}`}>
            <label for="l-pw">Password</label>
            <input class="input" id="l-pw" name="password" type="password" autocomplete="current-password" required {...invalidAttrs(errors, 'password', 'l-pw')} />
            <FieldError errors={errors} name="password" id="l-pw" />
          </div>
          <button type="submit" class="btn btn-primary">{invite ? 'Sign in and join' : 'Sign in'}</button>
        </form>

        <p class="auth-foot">New here? <a href={`/register${inviteQuery(invite)}`}>Create an account</a></p>
      </div>
    </Document>
  );
}

export function RegisterPage({ ctx, invite }: { ctx: PageContext; invite: InviteContext | null }): Html {
  const { errors, values } = ctx;
  return (
    <Document title="Create account">
      <div class="auth-page register">
        <div class="auth-head">
          <Icon name="logo" size={40} />
          <h1>Create your account</h1>
        </div>

        <form method="post" action="/register" class="auth-card" novalidate>
          <Notices ctx={ctx} />
          {invite ? <InviteNotice invite={invite} after="After you create your account" /> : null}
          <div class={`field${errors.name ? ' invalid' : ''}`}>
            <label for="r-name">Full name</label>
            <input class="input" id="r-name" name="name" type="text" autocomplete="name" maxlength="80" required value={text(values.name)} {...invalidAttrs(errors, 'name', 'r-name')} />
            <FieldError errors={errors} name="name" id="r-name" />
          </div>
          <div class={`field${errors.email ? ' invalid' : ''}`}>
            <label for="r-email">Email</label>
            <input class="input" id="r-email" name="email" type="email" autocomplete="email" required value={text(values.email)} {...invalidAttrs(errors, 'email', 'r-email')} />
            <FieldError errors={errors} name="email" id="r-email" />
          </div>
          <div class={`field${errors.password ? ' invalid' : ''}`}>
            <label for="r-pw">Password</label>
            <input class="input" id="r-pw" name="password" type="password" autocomplete="new-password" minlength="8" required aria-describedby={errors.password ? 'r-pw-error' : 'r-pw-hint'} aria-invalid={errors.password ? 'true' : undefined} />
            {errors.password
              ? <FieldError errors={errors} name="password" id="r-pw" />
              : <span id="r-pw-hint" class="hint">At least 8 characters</span>}
          </div>
          <button type="submit" class="btn btn-primary">{invite ? 'Create account and join' : 'Create account'}</button>
        </form>

        <p class="auth-foot">Already have an account? <a href={`/login${inviteQuery(invite)}`}>Sign in</a></p>
      </div>
    </Document>
  );
}
