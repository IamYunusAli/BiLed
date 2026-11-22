import { h, Fragment, type Html } from '../jsx.js';
import { text, type FormValues } from '../context.js';
import type { FieldErrors } from '../../http-error.js';
import type { User } from '../../domain.js';
import type { MemberRow } from '../../repositories/memberships.js';
import { PRIORITY_LABEL, STATUS_LABEL } from '../../labels.js';
import { FieldError, invalidAttrs } from './common.js';

interface TaskFieldsProps {
  /** Current values: what was submitted, or the task being edited. */
  v: FormValues;
  idPrefix: string;
  withActual: boolean;
  assignees: MemberRow[];
  errors: FieldErrors;
  user: User;
}

/** The task form fields shared by "Add task" and "Edit task". */
export function TaskFields({ v, idPrefix: p, withActual, assignees, errors, user }: TaskFieldsProps): Html {
  return (
    <>
      <div class={`field${errors.title ? ' invalid' : ''}`}>
        <label for={`${p}-title`}>Title</label>
        <input class="input" id={`${p}-title`} name="title" type="text" maxlength="200" placeholder="e.g. Window replacement" required value={text(v.title)} {...invalidAttrs(errors, 'title', `${p}-title`)} />
        <FieldError errors={errors} name="title" id={`${p}-title`} />
      </div>
      <div class="form-grid-2">
        <div class="field">
          <label for={`${p}-status`}>Status</label>
          <select class="select" id={`${p}-status`} name="status">
            {Object.entries(STATUS_LABEL).map(([val, label]) => (
              <option value={val} selected={(v.status ?? 'todo') === val}>{label}</option>
            ))}
          </select>
        </div>
        <div class={`field${errors.priority ? ' invalid' : ''}`}>
          <label for={`${p}-prio`}>Priority</label>
          <select class="select" id={`${p}-prio`} name="priority">
            {Object.entries(PRIORITY_LABEL).map(([val, label]) => (
              <option value={val} selected={(v.priority ?? 'medium') === val}>{label}</option>
            ))}
          </select>
          <FieldError errors={errors} name="priority" id={`${p}-prio`} />
        </div>
      </div>
      <div class="form-grid-2">
        <div class={`field${errors.assigneeId ? ' invalid' : ''}`}>
          <label for={`${p}-assignee`}>Assignee</label>
          <select class="select" id={`${p}-assignee`} name="assigneeId">
            <option value="">Unassigned</option>
            {assignees.map((m) => (
              <option value={m.user_id} selected={v.assigneeId === m.user_id}>{m.name}{m.user_id === user.id ? ' (you)' : ''}</option>
            ))}
          </select>
          <FieldError errors={errors} name="assigneeId" id={`${p}-assignee`} />
        </div>
        <div class={`field${errors.dueDate ? ' invalid' : ''}`}>
          <label for={`${p}-due`}>Due date <span class="opt">(optional)</span></label>
          <input class="input" id={`${p}-due`} name="dueDate" type="date" value={text(v.dueDate)} {...invalidAttrs(errors, 'dueDate', `${p}-due`)} />
          <FieldError errors={errors} name="dueDate" id={`${p}-due`} />
        </div>
      </div>
      <div class={`field${errors.estimatedCost ? ' invalid' : ''}`}>
        <label for={`${p}-cost`}>Estimated cost</label>
        <div class="money"><span class="money-unit">ETB</span><input id={`${p}-cost`} name="estimatedCost" type="text" inputmode="decimal" placeholder="0.00" value={text(v.estimatedCost)} aria-describedby={errors.estimatedCost ? `${p}-cost-error` : `${p}-cost-hint`} aria-invalid={errors.estimatedCost ? 'true' : undefined} /></div>
        {errors.estimatedCost
          ? <FieldError errors={errors} name="estimatedCost" id={`${p}-cost`} />
          : <span id={`${p}-cost-hint`} class="hint">Up to 2 decimals, e.g. 1500 or 1500.50</span>}
      </div>
      {withActual ? (
        <div class={`field${errors.actualCost ? ' invalid' : ''}`}>
          <label for={`${p}-actual`}>Actual cost <span class="opt">(what was really paid, if known)</span></label>
          <div class="money"><span class="money-unit">ETB</span><input id={`${p}-actual`} name="actualCost" type="text" inputmode="decimal" placeholder="Not recorded" value={text(v.actualCost)} {...invalidAttrs(errors, 'actualCost', `${p}-actual`)} /></div>
          <FieldError errors={errors} name="actualCost" id={`${p}-actual`} />
        </div>
      ) : null}
      <div class="field">
        <label for={`${p}-desc`}>Description <span class="opt">(optional)</span></label>
        <textarea class="textarea" id={`${p}-desc`} name="description" rows="3" maxlength="4000">{text(v.description)}</textarea>
      </div>
    </>
  );
}
