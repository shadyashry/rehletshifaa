import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ConsultantProfileContent } from "@/lib/consultants";
import type { AdminApi } from "./admin-api";
import { ControlCenterError } from "./cc-ui";
import { ConsultantPublicProfile, type StaffConsultantProfile } from "./ConsultantPublicProfile";

const content: ConsultantProfileContent = {
  initials: "OS", name: "Dr Omar Said", credentials: "MD", achievementBadges: [], specialty: "Cardiology",
  role: "Consultant", location: "Cairo", summary: "A public summary.", cardSummary: "A card summary.",
  expertise: { anchor: "Cardiology", areas: [] }, signals: [], focusAreas: [], qualifications: [], appointments: [],
  professionalStanding: [], verification: "Prepared from the supplied CV.", achievements: [], externalLinks: [],
};
const stored: StaffConsultantProfile = {
  practitionerId: "p-9", slug: "omar-said", published: false, everPublished: false, sortOrder: 1, version: 4,
  careArea: "cardiology", contentEn: content, contentAr: { ...content, name: "د. عمر سعيد", specialty: "أمراض القلب", role: "استشاري", summary: "ملخص عام.", cardSummary: "ملخص البطاقة.", expertise: { anchor: "أمراض القلب", areas: [] } },
};

afterEach(cleanup);

describe("Consultant public-profile editor", () => {
  it("blocks an invalid bilingual edit and sends the optimistic version after correction", async () => {
    const request = vi.fn(async (_path: string, init?: { method?: string; body?: unknown }) => init?.method === "PUT" ? { ...stored, ...(init.body as object), version: 5 } : stored);
    const api: AdminApi = async <T,>(path: string, init?: Parameters<AdminApi>[1]) => request(path, init) as Promise<T>;
    render(<ConsultantPublicProfile locale="en" api={api} practitionerId="p-9" careArea="cardiology" editableByUser />);
    const names = await screen.findAllByLabelText(/Public name/);
    fireEvent.change(names[0], { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByText("This field is required.")).toBeVisible();
    expect(request).toHaveBeenCalledTimes(1);

    fireEvent.change(names[0], { target: { value: "Dr Omar Said" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/control-center/consultants/p-9/public-profile", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ version: 4, slug: "omar-said" }) })));
    expect(await screen.findByText("Public profile saved.")).toBeVisible();
  });

  it("keeps typed content and explains an optimistic-version conflict", async () => {
    const request = vi.fn(async (_path: string, init?: { method?: string }) => {
      if (init?.method === "PUT") throw new ControlCenterError("stale", "PROFILE_VERSION_CONFLICT", 409);
      return stored;
    });
    const api: AdminApi = async <T,>(path: string, init?: Parameters<AdminApi>[1]) => request(path, init) as Promise<T>;
    render(<ConsultantPublicProfile locale="en" api={api} practitionerId="p-9" careArea="cardiology" editableByUser />);
    const names = await screen.findAllByLabelText(/Public name/);
    fireEvent.change(names[0], { target: { value: "Dr Omar Said Jr" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(/Refresh to see the latest version/)).toBeVisible();
    expect(names[0]).toHaveValue("Dr Omar Said Jr");
  });
});
