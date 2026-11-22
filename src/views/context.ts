import type { Response } from 'express';
import type { Tenant, User } from '../domain.js';
import type { FieldErrors } from '../http-error.js';
import type { MyOrgRow } from '../repositories/organizations.js';
import type { Html } from './jsx.js';

/** What a submitted form sent back, used to re-fill the inputs after a validation error. */
export type FormValues = Record<string, unknown>;

/** The state of a form after a failed submission. */
export interface FormState {
  errors?: FieldErrors;
  values?: FormValues;
  formError?: string | null;
}

/** Everything the shared layout (header, notices, form fields) needs on every page. */
export interface PageContext {
  user: User | undefined;
  tenant: Tenant | undefined;
  myOrgs: MyOrgRow[];
  currentPath: string;
  notice: string | null;
  formError: string | null;
  errors: FieldErrors;
  values: FormValues;
}

/** Pages inside an organization: the user is signed in and the membership is verified. */
export interface TenantContext extends PageContext {
  user: User;
  tenant: Tenant;
  /** "/orgs/<id>", the prefix for every link inside the organization. */
  base: string;
}

/** Pages that require a signed-in user. */
export interface UserContext extends PageContext {
  user: User;
}

/** Builds the page context from what the middleware put in res.locals, plus a form's state. */
export function pageContext(res: Response, state: FormState = {}): PageContext {
  const locals = res.locals as Partial<PageContext>;
  return {
    user: locals.user,
    tenant: locals.tenant,
    myOrgs: locals.myOrgs ?? [],
    currentPath: locals.currentPath ?? '',
    notice: locals.notice ?? null,
    formError: state.formError ?? null,
    errors: state.errors ?? {},
    values: state.values ?? {},
  };
}

export function userContext(res: Response, state: FormState = {}): UserContext {
  const ctx = pageContext(res, state);
  if (!ctx.user) throw new Error('BUG: signed-in page rendered without a user');
  return { ...ctx, user: ctx.user };
}

export function tenantContext(res: Response, state: FormState = {}): TenantContext {
  const ctx = userContext(res, state);
  if (!ctx.tenant) throw new Error('BUG: organization page rendered without a tenant');
  return { ...ctx, tenant: ctx.tenant, base: `/orgs/${ctx.tenant.orgId}` };
}

/** Sends a full HTML page. The status code, if not 200, is set by the caller beforehand. */
export function render(res: Response, page: Html): void {
  res.send(`<!doctype html>\n${page.value}\n`);
}

/** A form value as input text (undefined/null -> ""). */
export const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value));
