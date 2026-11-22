import { h, type Html } from '../jsx.js';
import { text, type UserContext } from '../context.js';
import type { MyOrgRow } from '../../repositories/organizations.js';
import { ROLE_LABEL } from '../../labels.js';
import { firstName } from '../../view-helpers.js';
import { FieldError, Notices, Tile, invalidAttrs } from '../partials/common.js';
import { Icon } from '../partials/icon.js';
import { AppPage } from '../partials/layout.js';

/** First run: the user belongs to no organization yet. */
export function WelcomePage({ ctx }: { ctx: UserContext }): Html {
  const { user, errors, values } = ctx;
  return (
    <AppPage ctx={ctx} title="Welcome" mainClass="main welcome">
      <Notices ctx={ctx} />
      <div class="welcome-head">
        <h1>Welcome, {firstName(user.name)}</h1>
        <p>You're not in an organization yet. Start one, or join your team's.</p>
      </div>

      <div class="welcome-grid">
        <section class="card welcome-card" aria-labelledby="w-create-h">
          <span class="icon-chip accent" aria-hidden="true"><Icon name="plus" size={20} /></span>
          <div class="stack-6">
            <h2 id="w-create-h">Create an organization</h2>
            <p class="muted">For your company, team or project group. You'll be its admin, and you can invite people right after.</p>
          </div>
          <form method="post" action="/orgs" class="form-stack push" novalidate>
            <div class={`field${errors.name ? ' invalid' : ''}`}>
              <label for="w-name">Organization name</label>
              <input class="input" id="w-name" name="name" type="text" maxlength="120" required value={text(values.name)} {...invalidAttrs(errors, 'name', 'w-name')} />
              <FieldError errors={errors} name="name" id="w-name" />
            </div>
            <button type="submit" class="btn btn-primary">Create organization</button>
          </form>
        </section>

        <section class="card welcome-card" aria-labelledby="w-join-h">
          <span class="icon-chip muted" aria-hidden="true"><Icon name="link" size={20} /></span>
          <div class="stack-6">
            <h2 id="w-join-h">Join your team</h2>
            <p class="muted">Ask an admin of your organization for an invite link, then open it. Each link works once, for 7 days.</p>
          </div>
          <ol class="numbered push">
            <li><span class="n" aria-hidden="true">1</span><span>The admin creates a link from the Members panel.</span></li>
            <li><span class="n" aria-hidden="true">2</span><span>You open it while signed in as <strong>{user.email}</strong>.</span></li>
            <li><span class="n" aria-hidden="true">3</span><span>You land inside the organization with the role they chose.</span></li>
          </ol>
        </section>
      </div>
    </AppPage>
  );
}

export function OrgsPage({ ctx, orgs }: { ctx: UserContext; orgs: MyOrgRow[] }): Html {
  const { errors, values } = ctx;
  return (
    <AppPage ctx={ctx} title="Your organizations" mainClass="main narrow">
      <Notices ctx={ctx} />
      <div class="stack-6">
        <h1 class="page-title">Your organizations</h1>
        <p class="lede">Only organizations you are a member of are listed here.</p>
      </div>

      <ul class="org-list panel">
        {orgs.map((o) => (
          <li>
            <a class="org-item" href={`/orgs/${o.id}`}>
              <Tile name={o.name} size={36} />
              <span class="org-name">{o.name}</span>
              <span class={`badge badge-${o.role}`}>{ROLE_LABEL[o.role]}</span>
              <Icon name="chevron" />
            </a>
          </li>
        ))}
      </ul>

      <section class="panel panel-pad" aria-labelledby="new-org-h">
        <form method="post" action="/orgs" class="form-stack" novalidate>
          <div class="stack-6">
            <h2 id="new-org-h" class="section-title">Create organization</h2>
            <p class="muted">You become its admin and can invite members with a link.</p>
          </div>
          <div class="inline-fields">
            <div class={`field grow${errors.name ? ' invalid' : ''}`}>
              <label for="o-name">Organization name</label>
              <input class="input" id="o-name" name="name" type="text" maxlength="120" required value={text(values.name)} {...invalidAttrs(errors, 'name', 'o-name')} />
              <FieldError errors={errors} name="name" id="o-name" />
            </div>
            <button type="submit" class="btn btn-primary">Create</button>
          </div>
        </form>
      </section>
    </AppPage>
  );
}
