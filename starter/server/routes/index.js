import * as auth from './auth.js';
import * as orgs from './orgs.js';
import * as invites from './invites.js';
import * as devices from './devices.js';
import * as sessions from './sessions.js';

// Registration order matters: the router takes the FIRST match, so more specific
// paths must be registered before parameterised ones that could swallow them.
// '/members/me' vs '/members/:userId' is ordered in orgs.js.
export function registerRoutes(router, deps) {
  auth.register(router, deps);
  orgs.register(router, deps);
  invites.register(router, deps);
  devices.register(router, deps);
  sessions.register(router, deps);
}
