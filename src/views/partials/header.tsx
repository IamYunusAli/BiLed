import { h, Fragment, type Html } from '../jsx.js';
import type { PageContext } from '../context.js';
import { ROLE_LABEL } from '../../labels.js';
import { firstName, initials } from '../../view-helpers.js';
import { Icon } from './icon.js';
import { Tile } from './common.js';

/** App header: brand, organization switcher (only the user's own orgs), My tasks, profile menu. */
export function Header({ ctx }: { ctx: PageContext }): Html {
  const { tenant, user, myOrgs, currentPath } = ctx;
  return (
    <header class="app-header">
      <div class="app-header-inner">
        <a class="brand" href="/orgs"><Icon name="logo" size={22} />DAPS Tracker</a>

        {tenant ? (
          <>
            <span class="header-sep" aria-hidden="true">/</span>
            <details class="dropdown org-switcher" data-dropdown>
              <summary aria-label={`Current organization: ${tenant.orgName}. Switch organization`}>
                <Tile name={tenant.orgName} size={24} />
                <span class="switcher-name">{tenant.orgName}</span>
                <span class={`badge badge-${tenant.role}`}>{ROLE_LABEL[tenant.role]}</span>
                <Icon name="chevron-down" />
              </summary>
              <div class="menu menu-left" role="menu">
                <p class="menu-label">Switch organization</p>
                {myOrgs.map((o) => {
                  const current = o.id === tenant.orgId;
                  return (
                    <a class="menu-item" role="menuitem" href={`/orgs/${o.id}`} aria-current={current ? 'page' : undefined}>
                      <Tile name={o.name} size={24} />
                      <span class="menu-item-text">{o.name}<span class="menu-item-sub">{ROLE_LABEL[o.role]}</span></span>
                      {current ? <Icon name="check" /> : null}
                    </a>
                  );
                })}
                <div class="menu-sep" role="separator"></div>
                <a class="menu-item" role="menuitem" href="/orgs"><Icon name="grid" /><span class="menu-item-text">All organizations</span></a>
              </div>
            </details>
          </>
        ) : null}

        <div class="header-spacer"></div>

        {user ? (
          <>
            <nav class="header-nav" aria-label="Main">
              <a class="nav-item" href="/my-tasks" aria-current={currentPath === '/my-tasks' ? 'page' : undefined}><Icon name="checklist" /><span>My tasks</span></a>
            </nav>
            <details class="dropdown profile" data-dropdown>
              <summary aria-label={`Account menu for ${user.name}`}>
                <span class="avatar sm" aria-hidden="true">{initials(user.name)}</span>
                <span class="profile-name">{firstName(user.name)}</span>
                <Icon name="chevron-down" />
              </summary>
              <div class="menu menu-right" role="menu">
                <div class="menu-profile">
                  <span class="avatar" aria-hidden="true">{initials(user.name)}</span>
                  <span class="menu-item-text"><strong>{user.name}</strong><span class="menu-item-sub">{user.email}</span></span>
                </div>
                <div class="menu-sep" role="separator"></div>
                <a class="menu-item" role="menuitem" href="/my-tasks"><Icon name="checklist" /><span class="menu-item-text">My tasks</span></a>
                <a class="menu-item" role="menuitem" href="/orgs"><Icon name="grid" /><span class="menu-item-text">Your organizations</span></a>
                <div class="menu-sep" role="separator"></div>
                <form method="post" action="/logout" class="menu-form">
                  <button type="submit" class="menu-item menu-item-quiet" role="menuitem"><Icon name="logout" /><span class="menu-item-text">Log out</span></button>
                </form>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </header>
  );
}
