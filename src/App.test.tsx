import { fireEvent, render, screen } from "@testing-library/react";
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

  it("records a session observation", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Session Runner" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Session" }));
    fireEvent.change(screen.getByLabelText("Actual State"), {
      target: { value: "The installer showed the setup entry point." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record Observation" }));

    expect(screen.getByRole("heading", { name: "3 Observations" })).toBeInTheDocument();
  });

  it("adds an evidence annotation", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Copy issue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Annotation" }));

    expect(screen.getByText("Copy issue")).toBeInTheDocument();
  });

  it("shows generated diff review items", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Diffs" }));

    expect(screen.getByRole("heading", { name: "Diffs" })).toBeInTheDocument();
    expect(screen.getByText("missing_node")).toBeInTheDocument();
    expect(screen.getByText("goal_not_satisfied")).toBeInTheDocument();
  });

  it("applies a DAG change proposal", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Proposals" }));
    expect(screen.getByRole("heading", { name: "3 Operations" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply Proposal" }));

    expect(screen.getByRole("heading", { name: "1 Applied" })).toBeInTheDocument();
    expect(screen.getByText("Result: goal-setup-v2")).toBeInTheDocument();
  });
});
