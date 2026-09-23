export type PortalRoleKey="patient"|"coordinator"|"doctor"|"operations"|"finance"|"admin"|"identity";

const roleMap:Record<PortalRoleKey,string[]>={
  patient:["PATIENT","PATIENT_REPRESENTATIVE"],
  coordinator:["COORDINATOR","COORDINATOR_LEAD"],
  doctor:["DOCTOR"],
  operations:["OPERATIONS","OPERATIONS_LEAD"],
  finance:["FINANCE","FINANCE_LEAD"],
  admin:["CREDENTIALING_ADMIN","SYSTEM_ADMIN","AUDITOR"],
  identity:["PATIENT_IDENTITY_REVIEWER","SYSTEM_ADMIN"],
};

const workforceRoles=new Set([
  "COORDINATOR","COORDINATOR_LEAD","DOCTOR","OPERATIONS","OPERATIONS_LEAD",
  "FINANCE","FINANCE_LEAD","CREDENTIALING_ADMIN","SYSTEM_ADMIN","AUDITOR","PATIENT_IDENTITY_REVIEWER",
]);

/** Keep workforce and patient personas separate even if the identity provider grants PATIENT by default. */
export function portalRoles(roles:string[]):PortalRoleKey[]{
  const workforce=roles.some(role=>workforceRoles.has(role));
  return (Object.keys(roleMap) as PortalRoleKey[]).filter(key=>(key!=="patient"||!workforce)&&roleMap[key].some(role=>roles.includes(role)));
}

/**
 * The legacy administration endpoints (`/admin/practitioners`, `/admin/staff`, `/admin/service-templates`,
 * `/admin/fx-rates`, `/identity-review`) are still gated by coarse realm roles on the backend. These are the same
 * role checks the former Administration console made, gathered in one place so Control Center navigation shows
 * those areas only to the accounts the backend will actually serve. The backend remains the authority.
 */
export function legacyAdministration(roles:string[]){
  const keys=portalRoles(roles);
  const admin=keys.includes("admin");
  const readOnly=admin&&roles.includes("AUDITOR");
  // systemAdmin mirrors the console: account, team and price-list edits were offered to SYSTEM_ADMIN only, and never in read-only mode.
  return {admin,readOnly,canManage:admin&&!readOnly,systemAdmin:admin&&!readOnly&&roles.includes("SYSTEM_ADMIN"),identityReviewer:keys.includes("identity")};
}
