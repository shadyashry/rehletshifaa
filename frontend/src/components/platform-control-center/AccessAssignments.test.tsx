import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AccessAssignments } from "./AccessAssignments";

afterEach(cleanup);
it("pins the selected published version and revokes with a reason and revision",async()=>{
  const api=vi.fn().mockResolvedValueOnce({versions:[{version:{id:"published",number:1,status:"PUBLISHED"},grants:[{scope:"PLATFORM"}]},
    {version:{id:"draft",number:2,status:"DRAFT"},grants:[]}]}).mockResolvedValue({status:"ACTIVE"});
  const reload=vi.fn().mockResolvedValue(undefined);
  render(<AccessAssignments locale="en" subject="reviewer" organization="platform" roles={[{id:"role",key:"PLATFORM_OWNER",name:"Owner",systemTemplate:true}]}
    sources={[{assignment:{id:"grant",status:"ACTIVE",revision:3},roleName:"Owner",version:{number:1}}]} api={api} reload={reload}/>);
  fireEvent.change(screen.getByLabelText("Role"),{target:{value:"role"}});
  await waitFor(()=>expect(screen.getByLabelText("Published version").querySelectorAll("option")).toHaveLength(2));
  fireEvent.change(screen.getByLabelText("Published version"),{target:{value:"published"}});
  fireEvent.change(screen.getByLabelText("Assignment scope"),{target:{value:"PLATFORM"}});
  fireEvent.change(screen.getByLabelText("Assignment or revocation reason"),{target:{value:"Independent review"}});
  fireEvent.click(screen.getByRole("button",{name:"Assign role"}));
  await waitFor(()=>expect(api).toHaveBeenCalledWith("/assignments","POST",expect.objectContaining({subject:"reviewer",versionId:"published",scope:"PLATFORM",reason:"Independent review"})));
  await screen.findByText(/Assignment saved/);
  fireEvent.click(screen.getByRole("button",{name:"Revoke assignment"}));
  await waitFor(()=>expect(api).toHaveBeenCalledWith("/assignments/grant/revoke?organization=platform","POST",{revision:3,reason:"Independent review"}));
  await waitFor(()=>expect(reload).toHaveBeenCalledTimes(2));
});
