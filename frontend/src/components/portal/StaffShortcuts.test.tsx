import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MyWork, type WorkItem } from "./MyWork";
import { StaffShortcuts, setShortcutsEnabled, useStaffShortcut } from "./StaffShortcuts";
import type { StaffViewItem } from "./StaffNav";
import { renderWithWork } from "./test-copy";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  Element.prototype.scrollIntoView = function () {};
});
afterEach(() => { cleanup(); setShortcutsEnabled(true); });

const item = (id: string, caseId: string, title: string): WorkItem => ({
  id, caseId, caseNumber: `RS-2026-00000${id}`, patientName: null, caseStatus: "INTAKE_REVIEW", waitingOn: "COORDINATOR",
  type: "REVIEW", title, context: null, priority: "NORMAL", status: "OPEN", blocking: false, dueAt: null, overdue: false,
  createdAt: new Date().toISOString(), version: 1,
});
const items = [item("1", "c1", "Review intake"), item("2", "c2", "Call the patient"), item("3", "c3", "Send the estimate")];
const views: StaffViewItem[] = [{ id: "work", label: "My work" }, { id: "mine", label: "My cases" }, { id: "team", label: "Team queue" }];

function Workspace({ onOpen = vi.fn(), onView = vi.fn(), caseOpen = false }: { onOpen?: (id: string) => void; onView?: () => void; caseOpen?: boolean }) {
  return <>
    <div id="staff-view"><MyWork locale="en" items={items} busy={false} onOpen={onOpen}/></div>
    <input aria-label="Notes"/>
    <StaffShortcuts views={views} caseOpen={caseOpen} onView={onView}/>
  </>;
}
const rows = () => screen.getAllByRole("button", { name: /^Open/ });
const key = (code: string, init: KeyboardEventInit = {}, target: Element = document.activeElement ?? document.body) =>
  fireEvent.keyDown(target, { code, key: code.replace(/^Key/, "").toLowerCase(), bubbles: true, ...init });

describe("My work as a roving-focus list", () => {
  it("is one tab stop; arrows, Home and End move between rows; Enter opens the row's case", () => {
    const onOpen = vi.fn();
    renderWithWork(<Workspace onOpen={onOpen}/>);
    expect(rows().map(row => row.tabIndex)).toEqual([0, -1, -1]);
    rows()[0].focus();
    key("ArrowDown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows()[1]);
    expect(rows().map(row => row.tabIndex)).toEqual([-1, 0, -1]);
    key("End", { key: "End" });
    expect(document.activeElement).toBe(rows()[2]);
    key("ArrowDown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows()[2]);
    key("Home", { key: "Home" });
    expect(document.activeElement).toBe(rows()[0]);
    fireEvent.click(rows()[0]);
    expect(onOpen).toHaveBeenCalledWith("c1");
  });
});

describe("single-key shortcuts", () => {
  it("j and k move between rows by physical key, so an Arabic layout works", () => {
    renderWithWork(<Workspace/>);
    key("KeyJ", { key: "ت" }, document.body);
    expect(document.activeElement).toBe(rows()[0]);
    key("KeyJ", { key: "ت" });
    expect(document.activeElement).toBe(rows()[1]);
    key("KeyK", { key: "ن" });
    expect(document.activeElement).toBe(rows()[0]);
  });

  it("ignores keys in a field, with a modifier, and while a modal dialog is open", () => {
    renderWithWork(<Workspace/>);
    const notes = screen.getByRole("textbox", { name: "Notes" });
    notes.focus();
    key("KeyJ", {}, notes);
    expect(document.activeElement).toBe(notes);
    rows()[0].focus();
    key("KeyJ", { ctrlKey: true });
    key("KeyJ", { shiftKey: true });
    expect(document.activeElement).toBe(rows()[0]);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    key("KeyJ");
    expect(document.activeElement).toBe(rows()[0]);
    dialog.remove();
  });

  it("g then a letter goes to a view this person has; the second key is consumed", () => {
    const onView = vi.fn();
    renderWithWork(<Workspace onView={onView}/>);
    key("KeyG", {}, document.body); key("KeyT", {}, document.body);
    expect(onView).toHaveBeenLastCalledWith("team");
    key("KeyG", {}, document.body); key("KeyM", {}, document.body);
    expect(onView).toHaveBeenCalledTimes(1); // no Conversations for this person
    key("KeyJ", {}, document.body);
    expect(document.activeElement).toBe(rows()[0]);
  });

  it("? opens the help naming every key; the switch turns single keys off and is kept in this browser", () => {
    renderWithWork(<Workspace/>);
    key("Slash", { key: "?", shiftKey: true }, document.body);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    for (const text of ["Next or previous row", "First or last row", "Open the row's case", "My work", "My cases", "Team queue", "Search cases", "Open the next item in My work"])
      expect(dialog.textContent).toContain(text);
    fireEvent.click(screen.getByRole("checkbox", { name: /Single-key shortcuts/ }));
    expect(window.localStorage.getItem("portal-shortcuts")).toBe("off");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    key("KeyJ", {}, document.body);
    expect(document.activeElement).not.toBe(rows()[0]);
    // Arrow keys in the list are widget keys, not shortcuts: they keep working.
    rows()[0].focus();
    key("ArrowDown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows()[1]);
    expect(screen.getByRole("button", { name: /Keyboard shortcuts/ }).textContent).toContain("off");
  });

  it("a component's own key (n on a case) fires once and not right after g", () => {
    const next = vi.fn();
    function Case() { useStaffShortcut("KeyN", next); return null; }
    renderWithWork(<><Workspace caseOpen/><Case/></>);
    act(() => { key("KeyN", {}, document.body); });
    expect(next).toHaveBeenCalledTimes(1);
    key("KeyG", {}, document.body); key("KeyN", {}, document.body);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("the key after g is consumed whichever listener was bound first", () => {
    const next = vi.fn();
    function Case() { useStaffShortcut("KeyN", next); return null; }
    renderWithWork(<><Case/><Workspace caseOpen/></>);
    key("KeyG", {}, document.body); key("KeyN", {}, document.body);
    expect(next).not.toHaveBeenCalled();
    key("KeyN", {}, document.body);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("tells screen readers how the list moves", () => {
    renderWithWork(<Workspace/>);
    const hint = document.getElementById(rows()[0].getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Up and down arrows move between rows.");
  });
});
