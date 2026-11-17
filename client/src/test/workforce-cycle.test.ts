import { describe, it, expect } from "vitest";
import { payrollCycleDates } from "@/pages/workforce/model";
describe("attendance source cycle boundaries", () => {
  it("clamps calendar month ends including leap February", () => {
    expect(
      payrollCycleDates("2028-02", {
        payroll_start_day: 1,
        payroll_end_day: 31,
      }),
    ).toEqual({ date_from: "2028-02-01", date_to: "2028-02-29" });
    expect(
      payrollCycleDates("2027-02", {
        payroll_start_day: 1,
        payroll_end_day: 31,
      }),
    ).toEqual({ date_from: "2027-02-01", date_to: "2027-02-28" });
  });
  it("uses the closing month for a cycle across a year boundary and rejects invalid months", () => {
    expect(
      payrollCycleDates("2027-01", {
        payroll_start_day: 26,
        payroll_end_day: 25,
      }),
    ).toEqual({ date_from: "2026-12-26", date_to: "2027-01-25" });
    expect(payrollCycleDates("", {})).toBeNull();
  });
});
