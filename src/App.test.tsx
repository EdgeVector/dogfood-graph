import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the Dogfood Graph shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Dogfood Graph" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Flows" })).toBeInTheDocument();
    expect(
      screen.getByText("No dogfood flows yet"),
    ).toBeInTheDocument();
  });
});
