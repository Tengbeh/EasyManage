import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeaveRequestDialog } from "@/pages/workforce/Leave";
import { setCsrfToken } from "@/lib/api";
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    session: {
      user: {
        role: "employee",
        employee_id: "employee-own",
        user_id: "user-own",
      },
    },
    can: (p: string) => ["self.leave", "self.attendance"].includes(p),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const policy = {
  leave_type_id: "type-medical",
  name: "Medical",
  paid: true,
  approval_roles: ["hr", "administrator"],
  requires_document: true,
};
let calls: { path: string; init?: RequestInit }[] = [];
let failSave = false;
const response = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
function mount() {
  const close = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <LeaveRequestDialog record={{}} onClose={close} />
    </QueryClientProvider>,
  );
  return close;
}
async function complete() {
  await screen.findByRole("option", { name: "Medical · Paid" });
  await userEvent.selectOptions(
    screen.getByLabelText("Leave type *"),
    "type-medical",
  );
  await userEvent.type(
    screen.getByLabelText("Reason *"),
    "Medical appointment",
  );
  await userEvent.selectOptions(screen.getByLabelText("Save as"), "pending");
}
beforeEach(() => {
  calls = [];
  failSave = false;
  setCsrfToken("csrf-test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith("/api/workforce/leave-types"))
        return response([policy]);
      if (path === "/api/workforce/leave-attachments")
        return response({ attachment_id: "private-attachment" });
      if (path === "/api/workforce/leave") {
        if (failSave) {
          failSave = false;
          throw new TypeError("Network disconnected");
        }
        return response({ leave_id: "leave-saved" });
      }
      throw new Error(`Unexpected request ${path}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("employee leave workflow", () => {
  it("requires a policy, reason, and valid date range without submitting invalid data", async () => {
    mount();
    await screen.findByRole("option", { name: "Medical · Paid" });
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Choose a leave type.")).toBeInTheDocument();
    expect(
      screen.getByText("Explain the reason for this request."),
    ).toBeInTheDocument();
    await complete();
    await userEvent.clear(screen.getByLabelText("Start date *"));
    await userEvent.type(screen.getByLabelText("Start date *"), "2026-11-20");
    await userEvent.clear(screen.getByLabelText("End date *"));
    await userEvent.type(screen.getByLabelText("End date *"), "2026-11-19");
    await userEvent.click(
      screen.getByRole("button", { name: "Submit request" }),
    );
    expect(
      await screen.findByText(
        "The end date must be on or after the start date.",
      ),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(0);
  });
  it("requires a supporting document under the configured policy", async () => {
    mount();
    await complete();
    await userEvent.click(
      screen.getByRole("button", { name: "Submit request" }),
    );
    expect(
      await screen.findByText(
        "This leave policy requires a supporting document.",
      ),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });
  it("uploads privately once and retains the save idempotency key after a network failure", async () => {
    const close = mount();
    await complete();
    await userEvent.upload(
      screen.getByLabelText("Supporting document"),
      new File(["%PDF-1.7 test"], "medical.pdf", { type: "application/pdf" }),
    );
    failSave = true;
    await userEvent.click(
      screen.getByRole("button", { name: "Submit request" }),
    );
    expect(await screen.findByText("Network disconnected")).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Submit request" }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    const uploads = calls.filter(
      (c) => c.path === "/api/workforce/leave-attachments",
    );
    const saves = calls.filter((c) => c.path === "/api/workforce/leave");
    expect(uploads).toHaveLength(1);
    expect(uploads[0].init?.body).toBeInstanceOf(FormData);
    expect(new Headers(uploads[0].init?.headers).has("Content-Type")).toBe(
      false,
    );
    expect(new Headers(uploads[0].init?.headers).get("x-csrf-token")).toBe(
      "csrf-test",
    );
    expect(saves).toHaveLength(2);
    expect(new Headers(saves[0].init?.headers).get("Idempotency-Key")).toBe(
      new Headers(saves[1].init?.headers).get("Idempotency-Key"),
    );
    const body = JSON.parse(String(saves[1].init?.body));
    expect(body.supporting_attachment_id).toBe("private-attachment");
    expect(body).not.toHaveProperty("employee_id");
    expect(calls.some((c) => c.path.startsWith("/api/employees"))).toBe(false);
  });
  it("rejects an oversized document before upload", async () => {
    mount();
    await complete();
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(screen.getByLabelText("Supporting document"), file);
    expect(
      screen.getByText("The file must be 5 MB or smaller."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Submit request" }),
    );
    expect(
      calls.some((c) => c.path === "/api/workforce/leave-attachments"),
    ).toBe(false);
  });
});
