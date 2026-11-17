import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FormDialog,
  Restricted,
  Status,
  Tabs,
  type FormSpec,
} from "@/components/shared";
import { useAuth } from "@/lib/auth";
import { formatDate, titleCase, type Row } from "@/lib/utils";
import { RecordList } from "./shared";
import {
  assignmentFields,
  entitlementFields,
  holidayFields,
  policyFields,
  policyPayload,
  scheduleFields,
} from "./model";

const configs = {
  schedules: {
    title: "Work schedules",
    singular: "schedule",
    id: "schedule_id",
    fields: scheduleFields,
    columns: [
      { key: "name", label: "Schedule" },
      { key: "timezone", label: "Timezone" },
      {
        key: "is_default",
        label: "Assignment",
        render: (r: Row) =>
          r.is_default ? "Department default" : "Individual assignments",
      },
      {
        key: "work_days",
        label: "Working days",
        render: (r: Row) =>
          (r.work_days || [])
            .map(
              (d: number) =>
                ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d],
            )
            .join(", "),
      },
      {
        key: "times",
        label: "Shift",
        render: (r: Row) => `${r.expected_start} – ${r.expected_end}`,
      },
      {
        key: "overtime_enabled",
        label: "Overtime",
        render: (r: Row) => (r.overtime_enabled ? "Enabled" : "Disabled"),
      },
      {
        key: "unpaid_absence_enabled",
        label: "Unpaid absence",
        render: (r: Row) => (r.unpaid_absence_enabled ? "Enabled" : "Disabled"),
      },
    ],
  },
  assignments: {
    title: "Shift assignments",
    singular: "assignment",
    id: "assignment_id",
    fields: assignmentFields,
    columns: [
      { key: "employee_name", label: "Employee" },
      { key: "schedule_name", label: "Schedule" },
      {
        key: "start_date",
        label: "From",
        render: (r: Row) => formatDate(r.start_date),
      },
      {
        key: "end_date",
        label: "Until",
        render: (r: Row) => (r.end_date ? formatDate(r.end_date) : "Ongoing"),
      },
    ],
  },
  holidays: {
    title: "Holidays",
    singular: "holiday",
    id: "holiday_id",
    fields: holidayFields,
    columns: [
      { key: "name", label: "Holiday" },
      { key: "date", label: "Date", render: (r: Row) => formatDate(r.date) },
      {
        key: "department_name",
        label: "Applies to",
        render: (r: Row) =>
          r.department_name ||
          (!r.department_id ? "Whole company" : "Selected department"),
      },
    ],
  },
  "leave-types": {
    title: "Leave policies",
    singular: "leave policy",
    id: "leave_type_id",
    fields: policyFields,
    columns: [
      { key: "name", label: "Leave type" },
      {
        key: "paid",
        label: "Pay",
        render: (r: Row) => (r.paid ? "Paid" : "Unpaid"),
      },
      { key: "annual_entitlement", label: "Annual days" },
      {
        key: "accrual_mode",
        label: "Accrual",
        render: (r: Row) => titleCase(r.accrual_mode),
      },
      {
        key: "approval_roles",
        label: "Approval stages",
        render: (r: Row) => (r.approval_roles || []).map(titleCase).join(" → "),
      },
      {
        key: "requires_document",
        label: "Document",
        render: (r: Row) => (r.requires_document ? "Required" : "Optional"),
      },
    ],
  },
  entitlements: {
    title: "Leave entitlements",
    singular: "entitlement",
    id: "entitlement_id",
    fields: entitlementFields,
    columns: [
      { key: "employee_name", label: "Employee" },
      { key: "leave_type_name", label: "Leave type" },
      { key: "year", label: "Year" },
      { key: "days", label: "Days" },
      { key: "reason", label: "Reason" },
    ],
  },
};
export type PolicyResource = keyof typeof configs;
export function Policies({
  initial = "schedules",
}: {
  initial?: PolicyResource;
}) {
  const { can } = useAuth();
  const [tab, setTab] = useState<PolicyResource>(initial);
  const [form, setForm] = useState<FormSpec | null>(null);
  if (!can("workforce.manage")) return <Restricted />;
  const config = configs[tab];
  const edit = (row?: Row) =>
    setForm({
      title: `${row ? "Edit" : "Add"} ${config.singular}`,
      description:
        tab === "leave-types"
          ? "Set your company policy. No entitlement is assumed until configured."
          : tab === "schedules"
            ? "Schedule times use the selected timezone. Overtime and unpaid absence impacts require explicit policy and approval."
            : undefined,
      path: `/workforce/${tab}${row ? "/" + row[config.id] : ""}`,
      method: row ? "PUT" : "POST",
      fields: config.fields,
      initial: row
        ? {
            ...row,
            ...(row.work_days ? { work_days: row.work_days.map(String) } : {}),
          }
        : undefined,
      transform: policyPayload,
      submitLabel: row ? "Save changes" : `Add ${config.singular}`,
    });
  return (
    <>
      <Tabs
        items={Object.entries(configs).map(([id, c]) => ({
          id,
          label: c.title,
        }))}
        value={tab}
        onChange={(v) => setTab(v as PolicyResource)}
      />
      <RecordList
        key={tab}
        resource={tab}
        title={config.title}
        idKey={config.id}
        action={
          <Button onClick={() => edit()}>
            <Plus size={16} />
            Add {config.singular}
          </Button>
        }
        columns={[
          ...config.columns,
          {
            key: "actions",
            label: "",
            render: (r) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${config.singular}`}
                onClick={() => edit(r)}
              >
                <Pencil size={15} />
              </Button>
            ),
          },
        ]}
      />
      <FormDialog spec={form} onClose={() => setForm(null)} />
    </>
  );
}
