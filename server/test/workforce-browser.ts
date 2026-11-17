/** Isolated localhost browser fixture. Never imported by production. */
import express from "express";
import path from "node:path";
import { workforceFixture } from "./workforce-fixture.js";
const f = await workforceFixture();
const admin = await f.login();
await admin.write("post", "/api/workforce/schedules", f.schedule).expect(201);
await admin
  .write("post", "/api/workforce/leave-types", {
    name: "Annual leave",
    annual_entitlement: "20",
    accrual_mode: "upfront",
    approval_roles: ["hr"],
    carry_forward_limit: "5",
  })
  .expect(201);
const hr = await f.login("hr");
for (const [date, out] of [
  ["2026-11-09", "17:00"],
  ["2026-11-10", "19:00"],
  ["2026-11-11", "17:00"],
]) {
  const record = (
    await hr
      .write("post", "/api/workforce/attendance", {
        employee_id: f.employees[0].employee_id,
        date,
        clock_in: `${date}T09:00:00Z`,
        clock_out: `${date}T${out}:00Z`,
        break_minutes: 0,
        status: "present",
        reason: "Fictional browser QA record",
      })
      .expect(201)
  ).body.data;
  await admin
    .write("post", `/api/workforce/attendance/${record.attendance_id}/approve`)
    .expect(200);
  await admin
    .write("post", `/api/workforce/attendance/${record.attendance_id}/finalize`)
    .expect(200);
}
const authorization = f.provider.authorizationUrl.bind(f.provider);
f.provider.authorizationUrl = (input) => {
  authorization(input);
  return `/api/auth/google/callback?state=${input.state}&code=${input.state}`;
};
f.app.get("/__qa/signin/:role", (req, res) => {
  if (
    !["administrator", "hr", "employee", "employee2", "accountant"].includes(
      req.params.role,
    )
  ) {
    res.sendStatus(400);
    return;
  }
  f.setEmail(`${req.params.role}@example.test`);
  res.redirect("/api/auth/google");
});
f.app.use(express.static(path.resolve("../client/dist")));
f.app.get("*", (_req, res) =>
  res.sendFile(path.resolve("../client/dist/index.html")),
);
const server = f.app.listen(3102, "127.0.0.1", () =>
  console.log("PostgreSQL workforce browser fixture on loopback 3102"),
);
process.on("SIGTERM", () =>
  server.close(() => {
    void f.close().finally(() => process.exit(0));
  }),
);
