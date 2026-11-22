import type { Tenant, User } from './domain.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by attachUser when a valid token for an existing user is present. Read it with currentUser(req). */
      user?: User | undefined;
      /** Set by loadMembership on /orgs/:orgId routes. Read it with tenantOf(req). */
      tenant?: Tenant | undefined;
    }
  }
}
