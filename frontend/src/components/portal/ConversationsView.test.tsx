import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

import { ConversationsView } from "./ConversationsView";
import { renderWithWork } from "./test-copy";

afterEach(cleanup);
// jsdom does not lay out, so it has no scrollIntoView.
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });

const summary = { id: "c1", name: "Layla", phoneHint: "•••• 0001", language: "en", ownerSubject: "me", ownerName: "Sara Ahmed",
  lastInboundAt: "2026-10-10T08:00:00Z", windowExpiresAt: "2026-10-11T08:00:00Z", windowOpen: true, awaitingReply: true };
const answered = { ...summary, id: "c2", name: "Omar", phoneHint: "•••• 0002", awaitingReply: false, windowOpen: false };
const detail = (over: object = {}) => ({ summary, status: "OPEN", coverName: null, canReply: true, canClaim: false, canReassign: false, canClose: true,
  messages: [{ id: "m1", direction: "IN", kind: "TEXT", body: "Hello, I need help", language: "en", createdAt: "2026-10-10T08:00:00Z" }], ...over });
const strip = (text: string | null | undefined) => (text ?? "").replace(/[⁨⁩]/g, "");

function fetcher(detailValue: object, list: object[] = [summary]) {
  return vi.fn(async (path: string) => (path.includes("?scope=") ? list : detailValue)) as unknown as <T,>(path: string) => Promise<T>;
}

async function openFirst() {
  fireEvent.click(await screen.findByRole("button", { name: /Layla/ }));
  await screen.findByText("Hello, I need help");
}

describe("ConversationsView", () => {
  it("lets the owner reply while the WhatsApp window is open, and confirms the send beside the composer", async () => {
    const mutate = vi.fn().mockResolvedValue({ status: "SENT" });
    renderWithWork(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={mutate} fetchJson={fetcher(detail())}/>);
    await openFirst();

    fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "We can help." } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/conversations/c1/messages", { body: "We can help." }));
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("Reply sent."));
  });

  it("offers only the follow-up once the window has closed", async () => {
    const mutate = vi.fn().mockResolvedValue({ status: "SENT" });
    const closed = detail({ summary: { ...summary, windowOpen: false } });
    renderWithWork(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={mutate} fetchJson={fetcher(closed)}/>);
    await openFirst();

    expect(screen.queryByLabelText("Your reply")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send follow-up" }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledWith("/coordinator/conversations/c1/follow-up", undefined));
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("Follow-up sent."));
  });

  it("shows a queued conversation with a take action and no composer", async () => {
    const queued = detail({ summary: { ...summary, ownerSubject: null, ownerName: null }, canReply: false, canClaim: true, canClose: false });
    renderWithWork(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={vi.fn()} fetchJson={fetcher(queued)}/>);
    await openFirst();

    expect(screen.getByRole("button", { name: "Take this conversation" })).toBeTruthy();
    expect(screen.queryByLabelText("Your reply")).toBeNull();
  });

  it("says in the list who is owed a reply and when the reply window closes", async () => {
    renderWithWork(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={vi.fn()} fetchJson={fetcher(detail(), [summary, answered])}/>);
    const owed = await screen.findByRole("button", { name: /Layla/ });
    expect(owed.textContent).toContain("Awaiting your reply");
    expect(strip(owed.textContent)).toMatch(/Reply window closes .*11/);
    const quiet = screen.getByRole("button", { name: /Omar/ });
    expect(quiet.textContent).not.toContain("Awaiting");
    expect(quiet.textContent).toContain("Reply window closed");
  });

  it("moves the focus to the thread when a conversation is picked", async () => {
    renderWithWork(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={vi.fn()} fetchJson={fetcher(detail())}/>);
    await openFirst();
    await vi.waitFor(() => expect(document.activeElement?.id).toBe("conversation-thread-title"));
  });

  it("is a roving list: one tab stop, arrows move between conversations", async () => {
    renderWithWork(<ConversationsView locale="en" lead={false} staff={[]} busy={false} mutate={vi.fn()} fetchJson={fetcher(detail(), [summary, answered])}/>);
    const first = await screen.findByRole("button", { name: /Layla/ });
    const second = screen.getByRole("button", { name: /Omar/ });
    expect(first.tabIndex).toBe(0);
    expect(second.tabIndex).toBe(-1);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
  });

  it("switches scope with underline tabs and the arrow keys", async () => {
    const fetchJson = fetcher(detail());
    renderWithWork(<ConversationsView locale="en" lead staff={[]} busy={false} mutate={vi.fn()} fetchJson={fetchJson}/>);
    const mine = await screen.findByRole("tab", { name: "Mine" });
    expect(mine.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(mine, { key: "ArrowRight" });
    const queue = screen.getByRole("tab", { name: "Queue" });
    expect(queue.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(queue);
    await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledWith("/coordinator/conversations?scope=queue"));
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(queue.id);
  });

  it("speaks Arabic and isolates each run of a row", async () => {
    renderWithWork(<ConversationsView locale="ar" lead={false} staff={[]} busy={false} mutate={vi.fn()} fetchJson={fetcher(detail())}/>, "ar");
    expect(await screen.findByRole("tab", { name: "محادثاتي" })).toBeTruthy();
    const row = await screen.findByRole("button", { name: /Layla/ });
    expect(row.textContent).toContain("بانتظار ردّك");
    // The owner's Latin name sits in its own <bdi>, so the Arabic label and the date keep their order around it.
    expect([...row.querySelectorAll("bdi")].map(node => node.textContent)).toEqual(["Layla", "Sara Ahmed"]);
  });
});
