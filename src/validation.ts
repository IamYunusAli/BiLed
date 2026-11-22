import { z } from 'zod';
import { etbToSantim } from './money.js';
import { HttpError, type FieldErrors } from './http-error.js';
import { PRIORITIES, ROLES, STATUSES } from './domain.js';

export { PRIORITIES, ROLES, STATUSES };

/** ETB amount (string or number, up to 2 decimals) -> integer santim. */
const etb = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return etbToSantim(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Enter an amount in ETB, e.g. 1500 or 1500.50' });
    return z.NEVER;
  }
});

/** Optional field where "" (an emptied form input) or null means "clear it". */
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31')
  .refine((d) => {
    const date = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(d) && d >= '2000-01-01' && d <= '2100-12-31';
  }, 'Enter a real date');

const optionalText = (max: number) => z.string().trim().max(max).optional().default('');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password is too long (max 72 bytes)');

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

const taskFields = {
  priority: z.enum(PRIORITIES, { error: 'Choose high, medium or low' }),
  assigneeId: clearable(z.uuid('Choose a member of this organization')),
  dueDate: clearable(isoDate),
  actualCost: clearable(etb),
};

export const schemas = {
  register: z.object({ name: z.string().trim().min(1, 'Name is required').max(80), email, password }),
  login: z.object({ email, password: z.string().min(1, 'Password is required').max(200) }),
  org: z.object({ name: z.string().trim().min(1, 'Name is required').max(120) }),
  addMember: z.object({ email, role: z.enum(ROLES) }),
  changeRole: z.object({ role: z.enum(ROLES) }),
  project: z.object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    description: optionalText(2000),
    budget: etb,
  }),
  projectPatch: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    budget: etb.optional(),
  }),
  task: z.object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: optionalText(4000),
    status: z.enum(STATUSES).default('todo'),
    estimatedCost: etb.default(0),
    ...taskFields,
    priority: taskFields.priority.default('medium'),
  }),
  taskPatch: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    status: z.enum(STATUSES).optional(),
    estimatedCost: etb.optional(),
    ...taskFields,
    priority: taskFields.priority.optional(),
  }),
  taskFilter: z.object({ priority: z.enum(PRIORITIES, { error: 'Priority must be high, medium or low' }).optional() }),
  id: z.uuid(),
};

// NOTE: no schema contains orgId/org_id. Zod strips unknown keys, so an org id smuggled into a
// request body is silently dropped; the tenant always comes from the verified membership.

export type RegisterInput = z.output<typeof schemas.register>;
export type LoginInput = z.output<typeof schemas.login>;
export type OrgInput = z.output<typeof schemas.org>;
export type AddMemberInput = z.output<typeof schemas.addMember>;
export type RoleInput = z.output<typeof schemas.changeRole>;
export type ProjectInput = z.output<typeof schemas.project>;
export type ProjectPatch = z.output<typeof schemas.projectPatch>;
export type TaskInput = z.output<typeof schemas.task>;
export type TaskPatch = z.output<typeof schemas.taskPatch>;

/** Parses data or throws HttpError(400) with per-field messages. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const { fieldErrors } = z.flattenError(result.error) as { fieldErrors: FieldErrors };
    throw new HttpError(400, 'Please fix the highlighted fields', fieldErrors);
  }
  return result.data;
}

/** Path ids that are not UUIDs can never match a row: treat them as not found. */
export function parseId(value: unknown): string {
  const result = schemas.id.safeParse(value);
  if (!result.success) throw new HttpError(404);
  return result.data;
}
