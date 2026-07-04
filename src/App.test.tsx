import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the Dogfood Graph shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Dogfood Graph" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "DAG Editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Node" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Graph Valid" })).toBeInTheDocument();
  });
});
