import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  DEFAULT_COMPANY_ID,
  PostgresRepository,
} from "../repositories/postgres.js";
const args = process.argv.slice(2);
const value = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
for (let i = 0; i < args.length; i++) {
  if (
    ![
      "--company-id",
      "--name",
      "--currency",
      "--admin-email",
      "--admin-name",
    ].includes(args[i])
  )
    throw new Error(`Unknown argument ${args[i]}`);
  if (!args[++i]) throw new Error("Missing argument value");
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const id = (
  value("--company-id") ||
  process.env.DEFAULT_COMPANY_ID ||
  DEFAULT_COMPANY_ID
).toLowerCase();
const name = value("--name") || "EasyManage";
const currency = value("--currency") || "USD";
if (!/^[A-Z]{3}$/.test(currency))
  throw new Error("Currency must be a three-letter uppercase code.");
const email = value("--admin-email")?.trim().toLowerCase();
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error("Administrator email is invalid.");
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const repository = new PostgresRepository({ client, companyId: id });
try {
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    const existing = await tx.company.findUnique({ where: { company_id: id } });
    if (existing && (existing.name !== name || existing.currency !== currency))
      throw new Error(
        "Company exists with different settings. Bootstrap never overwrites existing company configuration.",
      );
    if (!existing)
      await tx.company.create({ data: { company_id: id, name, currency } });
  });
  await repository.initialize();
  if (email)
    await repository.transaction(async (tx) => {
      const users = await tx.list("Users");
      const existing = users.find((u) => u.email === email);
      if (existing) {
        if (existing.role !== "administrator" || existing.status !== "active")
          throw new Error(
            "Existing account is not an active administrator; use authorized user management.",
          );
        return;
      }
      if (users.length)
        throw new Error(
          "Administrator bootstrap only supports an empty company user list.",
        );
      const stamp = new Date().toISOString();
      const user = {
        user_id: randomUUID(),
        full_name: value("--admin-name") || email,
        email,
        role: "administrator",
        status: "active",
        permissions: [],
        created_at: stamp,
        updated_at: stamp,
      };
      await tx.commit([
        { table: "Users", record: user },
        {
          table: "Audit_Logs",
          record: {
            log_id: randomUUID(),
            user_id: user.user_id,
            action: "bootstrap_administrator",
            module: "users",
            record_id: user.user_id,
            timestamp: stamp,
            created_at: stamp,
          },
        },
      ]);
    });
  console.log(
    JSON.stringify({
      company_id: id,
      status: "initialized",
      administrator: email ? "authorized" : "unchanged",
    }),
  );
} finally {
  await client.$disconnect();
}
