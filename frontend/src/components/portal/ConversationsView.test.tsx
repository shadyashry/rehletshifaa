import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConversationsView } from "./ConversationsView";

afterEach(cleanup);

const summary = { id: "c1", name: "Layla", phoneHint: "•••• 0001", language: "en", ownerSubject: "me", ownerName: "Sara Ahmed",
  lastInboundAt: "2026-10-10T08:00:00Z", windowExpiresAt: "2026-10-11T08:00:00Z", windowOpen: true };
const detail = (over: object = {}) => ({ summary, status: "OPEN", coverName: null, canReply: true, canClaim: false, canReassign: false, canClose: true,
  messages: [{ id: "m1", direction: "IN", kind: "TEXT", body: "Hello, I need help", language: "en", createdAt: "2026-10-10T08:00:00Z" }], ...over });

function fetcher(detailValue: object) {
  return vi.fn(async (path: string) => (path.includes("?scope=") ? [summary] : detailValue)) as unknown as <T,>(path: string) => Promise<T>;
}

async function openFirst() {
  fireEvent.click(await screen.findByRole("button", { name: /Layla/ }));
  await screen.findByText("Hello, I need help");
}

describe("ConversationsView", () => {
  it("lets the owner reply while the WhatsApp window is open", async () => {
    const mutate = vi.fn().mockResolvedValue({ status: "SENT" });
    render(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={mutate} fetchJson={fetcher(detail())}/>);
    await openFirst();

    fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "We can help." } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/conversations/c1/messages", { body: "We can help." }));
  });

  it("offers only the follow-up once the window has closed", async () => {
    const mutate = vi.fn().mockResolvedValue({ status: "SENT" });
    const closed = detail({ summary: { ...summary, windowOpen: false } });
    render(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={mutate} fetchJson={fetcher(closed)}/>);
    await openFirst();

    expect(screen.queryByLabelText("Your reply")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send follow-up" }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/conversations/c1/follow-up", undefined));
  });

  it("shows a queued conversation with a take action and no composer", async () => {
    const queued = detail({ summary: { ...summary, ownerSubject: null, ownerName: null }, canReply: false, canClaim: true, canClose: false });
    render(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={vi.fn()} fetchJson={fetcher(queued)}/>);
    await openFirst();

    expect(screen.getByRole("button", { name: "Take this conversation" })).toBeTruthy();
    expect(screen.queryByLabelText("Your reply")).toBeNull();
  });

  it("speaks Arabic", async () => {
    render(<ConversationsView locale="ar" lead={false} staff={[]} busy={false} mutate={vi.fn()} fetchJson={fetcher(detail())}/>);
    expect(await screen.findByRole("button", { name: "محادثاتي" })).toBeTruthy();
  });
});
