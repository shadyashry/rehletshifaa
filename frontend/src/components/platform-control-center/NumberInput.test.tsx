import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NumberInput } from "./cc-ui";

afterEach(cleanup);

describe("Control Center NumberInput", () => {
  it("keeps Arabic keypad digits as Latin ones and hands them to onChange", () => {
    const onChange = vi.fn();
    render(<div lang="ar"><label htmlFor="n">الحد</label><NumberInput id="n" min={0} max={100} onChange={e => onChange(e.target.value)}/></div>);
    const field = screen.getByLabelText("الحد") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "٤٢" } });
    expect(field.value).toBe("42");
    expect(onChange).toHaveBeenLastCalledWith("42");
    expect(field.validity.valid).toBe(true);
  });

  it("refuses out of range or too many decimals in the page's language", () => {
    render(<div lang="en"><label htmlFor="n">Rate</label><NumberInput id="n" min="0" max="50" step="0.1"/></div>);
    const field = screen.getByLabelText("Rate") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "60" } });
    expect(field.validationMessage).toBe("Enter a number from 0 to 50, up to 1 decimals.");
    fireEvent.change(field, { target: { value: "2.55" } });
    expect(field.validity.valid).toBe(false);
    fireEvent.change(field, { target: { value: "2.5" } });
    expect(field.validity.valid).toBe(true);
  });

  it("drops letters as a number field does", () => {
    render(<div lang="ar"><label htmlFor="n">دقائق</label><NumberInput id="n" min={1} step="1"/></div>);
    const field = screen.getByLabelText("دقائق") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "1a٠" } });
    expect(field.value).toBe("10");
    expect(field.inputMode).toBe("numeric");
  });
});
