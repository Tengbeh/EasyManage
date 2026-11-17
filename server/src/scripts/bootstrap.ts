import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readConfig } from "../config.js";
import { SheetsRepository } from "../repository.js";
import { acquireWriterLock } from "../writer-lock.js";
const config = readConfig();
const email = z
  .string()
  .email()
  .parse(process.argv[2] || config.bootstrapAdminEmail)
  .toLowerCase();
const release = await acquireWriterLock(config.spreadsheetId);
try {
  const repo = new SheetsRepository(config);
  await repo.initialize();
  const users = await repo.list("Users");
  if (users.length)
    throw new Error(
      "Bootstrap is available only when Users is empty. Use administrator user management after first setup.",
    );
  const stamp = new Date().toISOString();
  const user = {
    user_id: randomUUID(),
    email,
    full_name: process.argv[3] || email,
    role: "administrator",
    permissions: [],
    status: "active",
    created_at: stamp,
    updated_at: stamp,
  };
  await repo.commit([
    { table: "Users", record: user },
    {
      table: "Audit_Logs",
      record: {
        log_id: randomUUID(),
        user_id: user.user_id,
        action: "bootstrap_administrator",
        module: "users",
        record_id: user.user_id,
        new_value: JSON.stringify({ email, role: user.role }),
        timestamp: stamp,
        created_at: stamp,
      },
    },
  ]);
  console.log(
    `Authorized ${email} as the first administrator. They must sign in with the matching verified Google account.`,
  );
} finally {
  await release();
}
