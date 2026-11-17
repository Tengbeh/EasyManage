import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataForm } from "@/components/shared";
import {
  scheduleFields,
  policyPayload,
  correctionFields,
} from "@/pages/workforce/model";

describe("workforce policy and correction forms", () => {
  it("keeps payroll-impact policies off until explicitly enabled and submits selected workdays", async () => {
    const save = vi.fn();
    render(
      <DataForm
        fields={scheduleFields.filter((f) => f.name !== "department_id")}
        onSubmit={(v) => save(policyPayload(v))}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Schedule name *"),
      "Overnight support",
    );
    await userEvent.clear(screen.getByLabelText("Shift starts *"));
    await userEvent.type(screen.getByLabelText("Shift starts *"), "22:00");
    await userEvent.clear(screen.getByLabelText("Shift ends *"));
    await userEvent.type(screen.getByLabelText("Shift ends *"), "06:00");
    expect(
      screen.getByRole("checkbox", { name: /Overtime policy enabled/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Unpaid absence policy enabled/ }),
    ).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Saturday" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({
      expected_start: "22:00",
      expected_end: "06:00",
      work_days: [1, 2, 3, 4, 5, 6],
      overtime_enabled: false,
      unpaid_absence_enabled: false,
      break_minutes: 0,
    });
  });
  it("rejects a correction whose clock-out precedes clock-in and keeps the reason mandatory", async () => {
    const save = vi.fn();
    render(
      <DataForm
        fields={correctionFields}
        initial={{
          clock_in: "2026-11-17T09:00",
          clock_out: "2026-11-17T08:00",
        }}
        onSubmit={save}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Clock-out must be after clock-in"),
    ).toBeInTheDocument();
    expect(screen.getByText("Reason is required")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("requires an employee mapping for employee user accounts", async () => {
    const save = vi.fn();
    render(
      <DataForm
        fields={[
          {
            name: "role",
            label: "Role",
            type: "select",
            options: [
              { value: "employee", label: "Employee" },
              { value: "hr", label: "HR" },
            ],
            default: "employee",
            required: true,
          },
          { name: "employee_id", label: "Linked employee" },
        ]}
        onSubmit={save}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Link an employee record for employee accounts"),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await userEvent.type(
      screen.getByLabelText("Linked employee"),
      "employee-123",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(save.mock.calls[0]?.[0]).toEqual({
        role: "employee",
        employee_id: "employee-123",
      }),
    );
  });
});
