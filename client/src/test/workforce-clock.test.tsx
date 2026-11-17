import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClockActions } from "@/pages/workforce/Clock";

describe("attendance clock controls", () => {
  it("offers only clock-in before the day starts and sends an action without a client timestamp", async () => {
    const action = vi.fn();
    render(
      <ClockActions attendance={null} pending={false} onAction={action} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clock in" }));
    expect(action).toHaveBeenCalledExactlyOnceWith("clock-in");
    expect(
      screen.queryByRole("button", { name: "Clock out" }),
    ).not.toBeInTheDocument();
  });
  it("requires ending an active break before clock-out", async () => {
    const action = vi.fn();
    const { rerender } = render(
      <ClockActions
        attendance={{
          clock_in: "2026-11-17T09:00:00Z",
          breaks: [{ started_at: "2026-11-17T12:00:00Z", ended_at: null }],
        }}
        trackBreaks
        pending={false}
        onAction={action}
      />,
    );
    expect(screen.getByRole("button", { name: "Clock out" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "End break" }));
    expect(action).toHaveBeenCalledWith("break-end");
    rerender(
      <ClockActions
        attendance={{
          clock_in: "2026-11-17T09:00:00Z",
          breaks: [
            {
              started_at: "2026-11-17T12:00:00Z",
              ended_at: "2026-11-17T12:30:00Z",
            },
          ],
        }}
        trackBreaks
        pending={false}
        onAction={action}
      />,
    );
    expect(screen.getByRole("button", { name: "Clock out" })).toBeEnabled();
  });
  it("prevents duplicate actions while a request is pending and after a completed day", () => {
    const { rerender } = render(
      <ClockActions
        attendance={{ clock_in: "2026-11-17T09:00:00Z" }}
        trackBreaks
        pending
        onAction={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole("button"))
      expect(button).toBeDisabled();
    rerender(
      <ClockActions
        attendance={{
          clock_in: "2026-11-17T09:00:00Z",
          clock_out: "2026-11-17T17:00:00Z",
        }}
        trackBreaks
        pending={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Your workday is complete.")).toBeInTheDocument();
  });
  it("hides break controls when tracking is disabled", () => {
    render(
      <ClockActions
        attendance={{ clock_in: "2026-11-17T09:00:00Z" }}
        pending={false}
        onAction={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Start break" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clock out" })).toBeEnabled();
  });
});
