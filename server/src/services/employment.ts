import type { Row } from "../repository.js";
/** Inclusive final employment date, shared by directory, sessions and workforce. */
export function employmentStatusAt(
  row: Row,
  date = new Date().toISOString().slice(0, 10),
) {
  let status = row.employment_status;
  if (row.employment_end_date) {
    if (
      row.employment_end_date < date &&
      ["active", "on_leave"].includes(status)
    )
      status = "terminated";
    else if (row.employment_end_date >= date && status === "terminated")
      status = "active";
  }
  return status;
}
