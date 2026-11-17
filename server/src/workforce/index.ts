import type { Express } from "express";
import type { ApiContext } from "../context.js";
import type { Config } from "../config.js";
import { installPolicies } from "./policies.js";
import { installAttendance } from "./attendance.js";
import { installLeave } from "./leave.js";
import { installPayrollInputs } from "./payroll-inputs.js";
import { installAttachments } from "./attachments.js";
import { installWorkforceReporting } from "./reporting.js";
export function installWorkforce(
  app: Express,
  ctx: ApiContext,
  config: Config,
) {
  installPolicies(app, ctx);
  installAttendance(app, ctx);
  installLeave(app, ctx);
  installPayrollInputs(app, ctx);
  installAttachments(app, ctx, config.storageRoot || "./private-storage");
  installWorkforceReporting(app, ctx);
}
