import {describe,expect,it} from "vitest";
import {portalRoles} from "./portal-role-access";

describe("portalRoles",()=>{
  it("keeps the patient portal for patient-only accounts",()=>expect(portalRoles(["PATIENT"])).toEqual(["patient"]));
  it("does not expose a patient persona to a coordinator with the default patient role",()=>expect(portalRoles(["PATIENT","COORDINATOR"])).toEqual(["coordinator"]));
  it("retains legitimate multiple workforce roles without adding patient",()=>expect(portalRoles(["PATIENT","COORDINATOR_LEAD","SYSTEM_ADMIN"])).toEqual(["coordinator","admin","identity"]));
});
