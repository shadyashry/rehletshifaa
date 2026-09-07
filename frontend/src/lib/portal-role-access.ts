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
