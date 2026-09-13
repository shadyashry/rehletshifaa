import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AccessGovernance } from "./AccessGovernance";
import { AccessNavigation } from "./AccessNavigation";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider",()=>{
  const auth={user:{access_token:"test",profile:{sub:"owner"}},loading:false,signIn:vi.fn()};
  return {useAuth:()=>auth};
});
vi.mock("@/lib/api",()=>({apiFetchAs:vi.fn()}));
const role={id:"role-1",key:"PRACTICE_MANAGER",name:"Practice Manager",purpose:"Manage practice operations within assigned scope",description:"Practice operations",family:"PROVIDER",systemTemplate:true};
const permission={key:"access.role.view",name:"View roles and capabilities",family:"access",risk:"LOW",scopes:["PLATFORM"],actors:["GOVERNANCE"],channels:["ADMIN_WEB"],dependencies:[],conflicts:[],executable:true};
const capabilities=["access.role.view","access.role.create","access.role.edit_draft","access.role.publish","access.role.simulate","access.effective_access.view","access.audit.view"];
beforeEach(()=>{
  vi.mocked(apiFetchAs).mockImplementation(async (_token,path)=>{
    const result=path.endsWith("/me")?capabilities.map(permission=>({permission,allowed:true,reason:"ALLOWED"}))
      :path.includes("/permissions")?[permission]:path.includes("/effective-access")?{subject:"owner",sources:[],relationships:[],decisions:[{permission:"access.role.view",allowed:false,reason:"INACTIVE_MEMBERSHIP"}]}
      :path.includes("/roles/")?{role,versions:[{version:{id:"v1",number:1,status:"PUBLISHED",revision:0,actorType:"PRACTICE_OPERATIONS",channel:"STAFF_WEB",createdBy:"maker"},grants:[]}]}
      :[role];
    return new Response(JSON.stringify(result),{status:200});
  });
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("Access governance business interface",()=>{
  it("renders business roles and keeps capability keys in advanced details",async()=>{
    render(<AccessGovernance locale="en"/>);
    expect(await screen.findByRole("button",{name:/Practice Manager/})).toBeVisible();
    expect(screen.queryByText("PRACTICE_MANAGER")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Capabilities"}));
    expect(screen.getByText("View roles and capabilities")).toBeVisible();
    const code=screen.getByText("access.role.view");expect(code.closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText(/Keycloak|JWT|Spring Security/)).not.toBeInTheDocument();
  });
  it("provides eleven labelled configuration steps and Arabic RTL controls",async()=>{
    const {container}=render(<AccessGovernance locale="ar"/>);
    await screen.findByRole("button",{name:/مدير العيادة/});
    expect(container.querySelector("main")).toHaveAttribute("dir","rtl");
    fireEvent.click(screen.getByRole("button",{name:"إنشاء دور"}));
    expect(screen.getByRole("list",{name:"إنشاء دور"}).querySelectorAll("button")).toHaveLength(11);
    expect(screen.getByLabelText("اسم الدور")).toBeVisible();
    expect(screen.getByRole("button",{name:"حفظ المسودة"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"4. نطاق البيانات"}));
    expect(screen.getByRole("button",{name:"4. نطاق البيانات"})).toHaveAttribute("aria-current","step");
  });
  it("shows explicit denial explanations for effective access",async()=>{
    render(<AccessGovernance locale="en"/>);
    await screen.findByRole("button",{name:/Practice Manager/});
    fireEvent.click(screen.getByRole("button",{name:"Effective access"}));
    fireEvent.change(screen.getByLabelText("Account identifier"),{target:{value:"owner"}});
    fireEvent.click(screen.getByRole("button",{name:"Review access"}));
    expect(await screen.findByText("Not allowed")).toBeVisible();
    expect(screen.getByText("No active membership in this organization")).toBeVisible();
  });
  it("fails closed on navigation and on a denied page",async()=>{
    vi.mocked(apiFetchAs).mockResolvedValue(new Response(JSON.stringify([{permission:"access.role.view",allowed:false}]),{status:200}));
    const navigation=render(<AccessNavigation locale="en"/>);
    await waitFor(()=>expect(apiFetchAs).toHaveBeenCalled());
    expect(screen.queryByRole("link",{name:"Roles & Access"})).not.toBeInTheDocument();navigation.unmount();
    render(<AccessGovernance locale="en"/>);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
    expect(screen.queryByRole("button",{name:"Create role"})).not.toBeInTheDocument();
  });
  it("renders a recoverable error without stale role data",async()=>{
    vi.mocked(apiFetchAs).mockRejectedValue(new Error("We could not complete this request."));
    render(<AccessGovernance locale="en"/>);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button",{name:"Refresh"})).toBeEnabled();
  });
});
