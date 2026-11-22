import { h, Fragment, nothing, type Child, type Html } from '../jsx.js';
import type { PageContext } from '../context.js';
import type { FieldErrors } from '../../http-error.js';
import type { BudgetStatus, Priority, Role, Status, User } from '../../domain.js';
import type { ActivityRow } from '../../repositories/activity.js';
import { BUDGET_STATUS_LABEL, PRIORITY_LABEL, ROLE_LABEL, STATUS_LABEL } from '../../labels.js';
import { initials, meter, tileClass } from '../../view-helpers.js';
import type { BudgetSummary } from '../../money.js';
import { Icon } from './icon.js';

/** <!doctype> is added by render(). The stylesheet and the progressive-enhancement script are external (strict CSP). */
export function Document({ title, children }: { title?: string | null; children?: Child }): Html {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? title + ' · DAPS Tracker' : 'DAPS Tracker'}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap" />
        <link rel="stylesheet" href="/styles.css" />
        <script src="/app.js" defer></script>
      </head>
      <body>{children}</body>
    </html>
  );
}

/** Success notice (from ?ok=) and the form-level error. */
export function Notices({ ctx }: { ctx: Pick<PageContext, 'notice' | 'formError'> }): Html {
  return (
    <>
      {ctx.notice ? <div class="notice notice-info" role="status"><Icon name="info" /><span>{ctx.notice}</span></div> : null}
      {ctx.formError ? <div class="notice notice-error" role="alert"><Icon name="alert" /><span>{ctx.formError}</span></div> : null}
    </>
  );
}

/** The first validation message for one field, linked to its input by id. */
export function FieldError({ errors, name, id }: { errors: FieldErrors; name: string; id: string }): Html {
  const messages = errors[name];
  if (!messages) return nothing;
  return <span class="field-error" id={`${id}-error`}><Icon name="alert-sm" />{messages[0]}</span>;
}

/** aria attributes for an input with a validation error. */
export const invalidAttrs = (errors: FieldErrors, name: string, id: string) =>
  errors[name] ? { 'aria-invalid': 'true', 'aria-describedby': `${id}-error` } : {};

type BadgeProps =
  | { kind: 'priority'; value: Priority }
  | { kind: 'status'; value: Status }
  | { kind: 'budget'; value: BudgetStatus }
  | { kind: 'role'; value: Role };

export function Badge(props: BadgeProps): Html {
  switch (props.kind) {
    case 'priority': {
      const { value } = props;
      return (
        <span class={`prio prio-${value}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1" y="7" width="2.4" height="4" rx=".6" fill="currentColor"></rect>
            <rect x="4.8" y="4" width="2.4" height="7" rx=".6" fill="currentColor" fill-opacity={value === 'low' ? '.25' : undefined}></rect>
            <rect x="8.6" y="1" width="2.4" height="10" rx=".6" fill="currentColor" fill-opacity={value === 'high' ? undefined : '.25'}></rect>
          </svg>
          {PRIORITY_LABEL[value]}
        </span>
      );
    }
    case 'status':
      return <span class={`status status-${props.value}`}><Icon name={`status-${props.value}`} />{STATUS_LABEL[props.value]}</span>;
    case 'budget': {
      const { value } = props;
      const icon = value === 'on_track' ? 'check-success' : value === 'at_risk' ? 'warning' : 'alert';
      return <span class={`bstatus bstatus-${value}`}><Icon name={icon} size={14} />{BUDGET_STATUS_LABEL[value]}</span>;
    }
    case 'role':
      return <span class={`badge badge-${props.value}`}>{ROLE_LABEL[props.value]}</span>;
  }
}

type MeterInput = Pick<BudgetSummary, 'budget_santim' | 'spent_santim' | 'actual_santim' | 'percent_used' | 'percent_actual'>;

/** Budget meter: two stacked <progress> bars (no inline styles under the CSP). */
export function Meter({ p, small = false }: { p: MeterInput; small?: boolean }): Html {
  const m = meter(p);
  return (
    <div class={`meter${small ? ' sm' : ''}${m.over ? ' over' : ''}`} role="img" aria-label={m.label}>
      <progress class="committed" value={m.committed} max={m.max} aria-hidden="true"></progress>
      <progress class="done" value={m.actual} max={m.max} aria-hidden="true"></progress>
    </div>
  );
}

const ACTIVITY_TIME = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa' } as const;

export function ActivityList({ activity, user }: { activity: ActivityRow[]; user: User }): Html {
  if (activity.length === 0) return <p class="activity-empty">Nothing has happened here yet.</p>;
  return (
    <ol class="activity">
      {activity.map((a) => (
        <li>
          <span class="avatar sm" aria-hidden="true">{initials(a.actor_name)}</span>
          <div class="activity-body">
            <p><strong>{a.actor_id === user.id ? 'You' : a.actor_name}</strong> {a.summary}</p>
            <time datetime={new Date(a.created_at).toISOString()}>{new Date(a.created_at).toLocaleString('en-GB', ACTIVITY_TIME)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** An organization's initials tile. */
export const Tile = ({ name, size }: { name: string; size: 24 | 32 | 36 | 48 | 56 }): Html => (
  <span class={`tile tile-${size} ${tileClass(name)}`} aria-hidden="true">{initials(name)}</span>
);
