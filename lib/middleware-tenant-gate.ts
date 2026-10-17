/**
 * Tenant gate outcomes after middleware resolves org→client for a signed-in user.
 *
 * Auth / middleware safety (P0): only empty or multi-tenant access-control
 * failures may signOut. Transient DB / admin / network failures must keep the
 * session (see auth-middleware-login-safety + middleware catch blocks).
 */
export type TenantGateKind = 'ok' | 'no_access' | 'multi_tenant' | 'transient'

/** True only for intentional access-control failures — never for transient DB errors. */
export function shouldSignOutForTenantGate(kind: TenantGateKind): boolean {
  return kind === 'no_access' || kind === 'multi_tenant'
}
