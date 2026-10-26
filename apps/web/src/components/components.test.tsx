import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { bigWeightFromKg, formatDuration, formatPair, plural, weightFromKg } from "../format";
import { PlateBar } from "./PlateBar";
import { Stepper } from "./Stepper";

describe("PlateBar", () => {
  it("describes the plates per side", () => {
    render(<PlateBar weight={225} unit="lb" />);
    expect(screen.getByRole("figure")).toHaveAccessibleName("Plates to load: Each side: 45 + 45 lb.");
  });

  it("warns when the target is under the bar or not loadable", () => {
    const { rerender } = render(<PlateBar weight={30} unit="lb" />);
    expect(screen.getByRole("figure")).toHaveTextContent("Lighter than the 45 lb bar");
    rerender(<PlateBar weight={137} unit="lb" />);
    expect(screen.getByRole("figure")).toHaveTextContent("That makes 135 lb, 2 lb short.");
  });

  it("draws nothing without a weight", () => {
    const { container } = render(<PlateBar weight={null} unit="kg" />);
    expect(container).toBeEmptyDOMElement();
  });
});

function Harness() {
  const [value, setValue] = useState("2.5");
  return <Stepper label="Weight" value={value} onChange={setValue} step={2.5} testId="w" />;
}

describe("Stepper", () => {
  it("nudges without going below zero", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "More weight" }));
    expect(screen.getByTestId("w")).toHaveValue("5");
    await user.click(screen.getByRole("button", { name: "Less weight" }));
    await user.click(screen.getByRole("button", { name: "Less weight" }));
    await user.click(screen.getByRole("button", { name: "Less weight" }));
    expect(screen.getByTestId("w")).toHaveValue("0");
  });
});

describe("format", () => {
  it("formats weights and counts", () => {
    expect(weightFromKg(100, "lb")).toBe("220.5 lb");
    expect(weightFromKg(null, "kg")).toBe("None yet");
    expect(bigWeightFromKg(10000, "kg")).toBe("10k");
    expect(bigWeightFromKg(500, "kg")).toBe("500");
    expect(formatPair(225, "lb", 5)).toBe("225 lb × 5");
    expect(formatPair(null, null, null)).toBe("Not logged");
    expect(formatDuration(1800)).toBe("30 min");
    expect(formatDuration(null)).toBe("Not finished");
    expect(plural(1, "set")).toBe("1 set");
    expect(plural(3, "set")).toBe("3 sets");
  });
});
