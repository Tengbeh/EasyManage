import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Inbox,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { useAction, useList, type Operation } from "@/lib/api";
import {
  cn,
  formatDate,
  formatMoney,
  initials,
  personName,
  titleCase,
  type Row,
} from "@/lib/utils";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand">
      <img src="/favicon.svg" alt="" />
      {!compact && (
        <span>
          Easy<span className="brand-light">Manage</span>
          <small>PEOPLE & PAYROLL</small>
        </span>
      )}
    </Link>
  );
}
export function Avatar({
  name,
  size = "md",
  image,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  image?: string;
}) {
  return (
    <span className={cn("avatar", `avatar-${size}`)}>
      {image ? (
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
export function Status({ value }: { value: unknown }) {
  const text = String(value || "pending");
  return (
    <span className={cn("status", `status-${text}`)}>
      <span />
      {titleCase(text)}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}
export function EmptyState({
  title = "No records yet",
  description = "Records will appear here once they are added.",
  icon: Icon = Inbox,
  action,
  compact = false,
}: {
  title?: string;
  description?: string;
  icon?: typeof Inbox;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("empty-state", compact && "empty-compact")}>
      <span className="empty-icon">
        <Icon size={24} strokeWidth={1.6} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading({
  label = "Loading your workspace…",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn("loading-state", compact && "empty-compact")}
      role="status"
    >
      <LoaderCircle className="animate-spin" size={23} />
      <span>{label}</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={23} />
      <div>
        <h3>We couldn’t load this information</h3>
        <p>{error instanceof Error ? error.message : "Please try again."}</p>
        <div className="flex gap-3 mt-3">
          {retry && (
            <Button variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link to="/setup">
              Connection guide <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
export function Restricted() {
  return (
    <EmptyState
      title="Access restricted"
      description="Ask your administrator for permission to access this section."
      icon={ShieldCheck}
    />
  );
}
export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card", className)}>
      <div className="card-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search records…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search">
          ×
        </button>
      )}
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="View sections">
      {items.map((i) => (
        <button
          role="tab"
          type="button"
          aria-selected={value === i.id}
          key={i.id}
          onClick={() => onChange(i.id)}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            const index = items.findIndex((t) => t.id === i.id);
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? items.length - 1
                  : (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) %
                    items.length;
            onChange(items[next].id);
            (
              e.currentTarget.parentElement?.querySelectorAll("button")[
                next
              ] as HTMLButtonElement
            )?.focus();
          }}
          className={cn(value === i.id && "selected")}
        >
          {i.label}
          {i.count !== undefined && <span>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}
export type Column = {
  key: string;
  label: string;
  render?: (r: Row) => ReactNode;
  sortable?: boolean;
  className?: string;
};
export function DataTable({
  rows,
  columns,
  idKey = "id",
  emptyTitle,
  emptyDescription,
  page,
  pageSize = 20,
  total,
  onPage,
  sort,
  direction,
  onSort,
  loading = false,
}: {
  rows: Row[];
  columns: Column[];
  idKey?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (p: number) => void;
  sort?: string;
  direction?: string;
  onSort?: (s: string) => void;
  loading?: boolean;
}) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.className}>
                  {c.sortable && onSort ? (
                    <button
                      className="sort-label"
                      onClick={() => onSort(c.key)}
                    >
                      {c.label}
                      {sort === c.key ? (
                        direction === "desc" ? (
                          <ArrowDown size={13} />
                        ) : (
                          <ArrowUp size={13} />
                        )
                      ) : (
                        <ArrowUpDown size={13} />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading &&
              rows.map((r, i) => (
                <tr key={r[idKey] || i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.className}>
                      {c.render
                        ? c.render(r)
                        : r[c.key] === null ||
                            r[c.key] === undefined ||
                            r[c.key] === ""
                          ? "—"
                          : String(r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {loading ? (
        <Loading compact label="Loading records…" />
      ) : !rows.length ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
      {page && onPage && (
        <div className="table-footer">
          <span>
            {total
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} records`
              : "0 records"}
          </span>
          <div className="pagination">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={17} />
            </Button>
            <span>Page {page}</span>
            <Button
              variant="outline"
              size="icon"
              disabled={page * pageSize >= (total ?? rows.length)}
              onClick={() => onPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={17} />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
export function PersonCell({
  row,
  subtitle,
  link = true,
}: {
  row: Row;
  subtitle?: string;
  link?: boolean;
}) {
  const name = personName(row);
  const content = (
    <>
      <Avatar name={name} size="sm" image={row.profile_image} />
      <span>
        <strong>{name}</strong>
        <small>{subtitle || row.email || row.employee_number}</small>
      </span>
    </>
  );
  return link && row.employee_id ? (
    <Link className="person-cell" to={`/employees/${row.employee_id}`}>
      {content}
    </Link>
  ) : (
    <div className="person-cell">{content}</div>
  );
}
export function DetailGrid({
  record,
  fields,
  currency = "USD",
}: {
  record: Row;
  fields: { key: string; label: string; type?: string }[];
  currency?: string;
}) {
  return (
    <dl className="detail-grid">
      {fields.map((f) => (
        <div key={f.key}>
          <dt>{f.label}</dt>
          <dd>
            {f.type === "money" ? (
              formatMoney(record[f.key], currency)
            ) : f.type === "date" ? (
              formatDate(record[f.key])
            ) : f.type === "status" ? (
              <Status value={record[f.key]} />
            ) : f.type === "json" ? (
              <pre>{JSON.stringify(record[f.key], null, 2) || "—"}</pre>
            ) : (
              String(record[f.key] ?? "—") || "—"
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "date"
    | "month"
    | "time"
    | "money"
    | "number"
    | "textarea"
    | "select"
    | "permissions"
    | "url"
    | "confirmation"
    | "checkbox"
    | "multi-select"
    | "datetime-local";
  required?: boolean;
  options?: { label: string; value: string }[];
  relation?: string;
  relationId?: string;
  relationLabel?: string;
  relationFilters?: Row;
  placeholder?: string;
  hint?: string;
  section?: string;
  wide?: boolean;
  min?: number;
  max?: number;
  decimalPlaces?: number;
  default?: string | boolean | string[];
};
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: titleCase(value) }));
export function RelationSelect({
  field,
  value,
  onChange,
  invalid = false,
}: {
  field: Field;
  value: string;
  onChange: (s: string) => void;
  invalid?: boolean;
}) {
  const [search, setSearch] = useState("");
  const q = useList(field.relation!, {
    search,
    pageSize: 100,
    ...field.relationFilters,
  });
  const idField =
    field.relationId ||
    (field.relation === "employees" ? "employee_id" : "department_id");
  const items = q.data?.data || [];
  return (
    <div className="relation-select">
      <input
        className="input relation-search"
        aria-label={`Search ${field.label.toLowerCase()}`}
        placeholder={`Find ${field.label.toLowerCase()}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        id={`field-${field.name}`}
        className="input"
        aria-label={field.label}
        aria-invalid={invalid}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {q.isPending ? "Loading…" : `Select ${field.label.toLowerCase()}`}
        </option>
        {value && !items.some((r) => r[idField] === value) && (
          <option value={value}>{value}</option>
        )}
        {items.map((r) => (
          <option key={r[idField]} value={r[idField]}>
            {field.relation === "employees"
              ? `${personName(r)}${r.employee_number ? " · " + r.employee_number : ""}`
              : r[field.relationLabel || "department_name"]}
          </option>
        ))}
      </select>
      {q.isError && <small className="field-error">{q.error.message}</small>}
    </div>
  );
}
export const PERMISSIONS = [
  "employees.read",
  "employees.write",
  "salaries.read",
  "salaries.write",
  "banking.read",
  "banking.write",
  "departments.write",
  "bonuses.read",
  "bonuses.write",
  "bonuses.approve",
  "penalties.read",
  "penalties.write",
  "penalties.approve",
  "loans.read",
  "loans.write",
  "loans.approve",
  "payroll.read",
  "payroll.generate",
  "payroll.approve",
  "payroll.finalize",
  "payroll.pay",
  "attendance.read",
  "attendance.write",
  "attendance.approve",
  "self.attendance",
  "self.leave",
  "workforce.manage",
  "attendance.payroll",
  "leave.read",
  "leave.write",
  "leave.approve",
  "reports.hr",
  "reports.finance",
  "users.manage",
  "settings.manage",
  "audit.read",
];
function formSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === "confirmation") {
      shape[f.name] = z.literal(true, {
        error: "Please confirm you have reviewed this information",
      });
      continue;
    }
    if (f.type === "checkbox") {
      shape[f.name] = z.boolean();
      continue;
    }
    if (f.type === "permissions" || f.type === "multi-select") {
      shape[f.name] = f.required
        ? z
            .array(z.string())
            .min(1, `Choose at least one ${f.label.toLowerCase()}`)
        : z.array(z.string());
      continue;
    }
    let schema = z.string();
    let validated: z.ZodType<string> = f.required
      ? schema.trim().min(1, `${f.label} is required`)
      : schema;
    if (f.type === "email")
      validated = validated.refine(
        (v: string) => !v || z.string().email().safeParse(v).success,
        "Enter a valid email address",
      );
    if (f.type === "url")
      validated = validated.refine(
        (v: string) =>
          !v ||
          (/^https:\/\//.test(v) && z.string().url().safeParse(v).success),
        "Enter a valid HTTPS URL",
      );
    if (f.type === "money")
      validated = validated.refine(
        (v: string) =>
          !v ||
          new RegExp(`^\\d+(\\.\\d{1,${f.decimalPlaces ?? 2}})?$`).test(v),
        `Use a positive amount with up to ${f.decimalPlaces ?? 2} decimal places`,
      );
    if (f.type === "datetime-local")
      validated = validated.refine(
        (v) => !v || !Number.isNaN(Date.parse(v + "Z")),
        "Enter a valid date and time",
      );
    if (f.type === "number")
      validated = validated.refine(
        (v) => !v || Number.isInteger(Number(v)),
        "Enter a whole number",
      );
    if (f.type === "date")
      validated = validated.refine(
        (v) =>
          !v ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
            !Number.isNaN(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
        "Enter a valid date",
      );
    if (f.type === "month")
      validated = validated.refine(
        (v) => !v || /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
        "Choose a valid month",
      );
    if (f.type === "number" || f.type === "money")
      validated = validated.refine(
        (v: string) =>
          !v ||
          (Number.isFinite(Number(v)) &&
            Number(v) >= (f.min ?? 0) &&
            Number(v) <= (f.max ?? Number.MAX_SAFE_INTEGER)),
        `Enter a value from ${f.min ?? 0}${f.max !== undefined ? " to " + f.max : ""}`,
      );
    shape[f.name] = validated;
  }
  return z.object(shape).superRefine((data, ctx) => {
    if (data.role === "employee" && !data.employee_id)
      ctx.addIssue({
        code: "custom",
        path: ["employee_id"],
        message: "Link an employee record for employee accounts",
      });
    if (data.employment_status === "terminated" && !data.employment_end_date)
      ctx.addIssue({
        code: "custom",
        path: ["employment_end_date"],
        message: "An end date is required for termination",
      });
    if (
      data.date_of_birth &&
      data.hire_date &&
      data.date_of_birth >= data.hire_date
    )
      ctx.addIssue({
        code: "custom",
        path: ["date_of_birth"],
        message: "Date of birth must be before the hire date",
      });
    if (data.check_in && data.check_out && data.check_out <= data.check_in)
      ctx.addIssue({
        code: "custom",
        path: ["check_out"],
        message: "Check-out must be after check-in",
      });
    if (
      data.loan_amount &&
      data.installment_amount &&
      Number(data.installment_amount) > Number(data.loan_amount)
    )
      ctx.addIssue({
        code: "custom",
        path: ["installment_amount"],
        message: "An installment cannot exceed the loan amount",
      });
    if (
      data.date &&
      ["present", "late", "half_day"].includes(String(data.status)) &&
      !data.clock_in
    )
      ctx.addIssue({
        code: "custom",
        path: ["clock_in"],
        message: "Clock-in is required for working attendance",
      });
    if (data.clock_out && !data.clock_in)
      ctx.addIssue({
        code: "custom",
        path: ["clock_in"],
        message: "Clock-in is required before clock-out",
      });
    if (data.clock_in && data.clock_out && data.clock_out <= data.clock_in)
      ctx.addIssue({
        code: "custom",
        path: ["clock_out"],
        message: "Clock-out must be after clock-in",
      });
    if (data.start_date && data.end_date && data.end_date < data.start_date)
      ctx.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "End date must be on or after the start date",
      });
    if (
      data.hire_date &&
      data.employment_end_date &&
      data.employment_end_date < data.hire_date
    )
      ctx.addIssue({
        code: "custom",
        path: ["employment_end_date"],
        message: "End date must be on or after the hire date",
      });
  });
}
export function DataForm({
  fields,
  initial = {},
  onSubmit,
  submitLabel = "Save changes",
  pending = false,
  error,
  onCancel,
}: {
  fields: Field[];
  initial?: Row;
  onSubmit: (values: Row) => void;
  submitLabel?: string;
  pending?: boolean;
  error?: Error | null;
  onCancel?: () => void;
}) {
  const schema = useMemo(() => formSchema(fields), [fields]);
  const defaults = Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.type === "confirmation"
        ? false
        : f.type === "checkbox"
          ? Boolean(initial[f.name] ?? f.default ?? false)
          : f.type === "permissions" || f.type === "multi-select"
            ? Array.isArray(initial[f.name])
              ? initial[f.name]
              : Array.isArray(f.default)
                ? f.default
                : []
            : String(initial[f.name] ?? f.default ?? ""),
    ]),
  );
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Row>({
    resolver: zodResolver(schema) as Resolver<Row>,
    defaultValues: defaults,
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-grid">
        {fields.map((f) => (
          <Fragment key={f.name}>
            {f.section && (
              <h3 className="form-section field-wide">{f.section}</h3>
            )}
            <div className={cn("field", f.wide && "field-wide")}>
              <label htmlFor={`field-${f.name}`}>
                {f.label}
                {f.required && <span className="required"> *</span>}
              </label>
              {f.relation ? (
                <RelationSelect
                  field={f}
                  value={watch(f.name)}
                  onChange={(v) =>
                    setValue(f.name, v, { shouldValidate: true })
                  }
                  invalid={!!errors[f.name]}
                />
              ) : f.type === "checkbox" ? (
                <div className="workforce-check">
                  <input
                    id={`field-${f.name}`}
                    type="checkbox"
                    {...register(f.name)}
                  />
                  <span>{f.hint || f.label}</span>
                </div>
              ) : f.type === "multi-select" ? (
                <div
                  className="workforce-options"
                  role="group"
                  aria-label={f.label}
                >
                  {f.options?.map((option) => (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        value={option.value}
                        {...register(f.name)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              ) : f.type === "confirmation" ? (
                <label className="confirmation-check">
                  <input
                    id={`field-${f.name}`}
                    type="checkbox"
                    {...register(f.name)}
                  />
                  <span>
                    {f.hint ||
                      "I have reviewed the details and confirm this action."}
                  </span>
                </label>
              ) : f.type === "permissions" ? (
                <div className="permission-grid">
                  {PERMISSIONS.map((p) => (
                    <label key={p}>
                      <input type="checkbox" value={p} {...register(f.name)} />
                      {p}
                    </label>
                  ))}
                </div>
              ) : f.type === "textarea" ? (
                <textarea
                  id={`field-${f.name}`}
                  className="input"
                  rows={3}
                  placeholder={f.placeholder}
                  {...register(f.name)}
                  aria-invalid={!!errors[f.name]}
                  aria-describedby={
                    errors[f.name] ? `error-${f.name}` : undefined
                  }
                />
              ) : f.type === "select" ? (
                <select
                  id={`field-${f.name}`}
                  className="input"
                  {...register(f.name)}
                  aria-invalid={!!errors[f.name]}
                >
                  <option value="">Select {f.label.toLowerCase()}</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`field-${f.name}`}
                  className="input"
                  type={f.type === "money" ? "text" : f.type || "text"}
                  inputMode={f.type === "money" ? "decimal" : undefined}
                  placeholder={f.placeholder}
                  min={f.min}
                  max={f.max}
                  {...register(f.name)}
                  aria-invalid={!!errors[f.name]}
                  aria-describedby={
                    errors[f.name] ? `error-${f.name}` : undefined
                  }
                />
              )}{" "}
              {errors[f.name] ? (
                <small
                  id={`error-${f.name}`}
                  className="field-error"
                  role="alert"
                >
                  {String(errors[f.name]?.message)}
                </small>
              ) : f.hint && f.type !== "checkbox" ? (
                <small className="field-hint">{f.hint}</small>
              ) : null}
            </div>
          </Fragment>
        ))}
      </div>
      {error && (
        <div className="form-error" role="alert">
          <AlertCircle size={17} />
          {error.message}
        </div>
      )}
      <div className="form-actions">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <Check size={16} />
          )}{" "}
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
export type FormSpec = {
  title: string;
  description?: string;
  fields: Field[];
  initial?: Row;
  path: string;
  method?: string;
  submitLabel?: string;
  transform?: (values: Row) => Row;
  onSuccess?: (r: Row) => void;
};
export function FormDialog({
  spec,
  onClose,
}: {
  spec: FormSpec | null;
  onClose: () => void;
}) {
  const action = useAction();
  const submission = useRef<{ signature: string; key: string } | null>(null);
  return (
    <Dialog
      open={!!spec}
      onOpenChange={(open) => {
        if (!open && !action.isPending) {
          action.reset();
          submission.current = null;
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>{spec?.title}</DialogTitle>
        <DialogDescription>
          {spec?.description ||
            "Complete the details below. Required fields are marked with an asterisk."}
        </DialogDescription>
        {spec && (
          <DataForm
            key={spec.path + spec.title}
            fields={spec.fields}
            initial={spec.initial}
            submitLabel={spec.submitLabel}
            pending={action.isPending}
            error={action.error}
            onCancel={() => {
              action.reset();
              submission.current = null;
              onClose();
            }}
            onSubmit={(values) => {
              const body = spec.transform ? spec.transform(values) : values;
              const signature = JSON.stringify({ path: spec.path, body });
              if (submission.current?.signature !== signature)
                submission.current = { signature, key: crypto.randomUUID() };
              action.mutate(
                {
                  path: spec.path,
                  method: spec.method,
                  body,
                  key: submission.current.key,
                },
                {
                  onSuccess: (r) => {
                    spec.onSuccess?.(r.data);
                    submission.current = null;
                    onClose();
                    action.reset();
                  },
                },
              );
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
export type ConfirmSpec = {
  title: string;
  description: string;
  operation: Operation;
  label?: string;
  destructive?: boolean;
};
export function ConfirmDialog({
  spec,
  onClose,
}: {
  spec: ConfirmSpec | null;
  onClose: () => void;
}) {
  const action = useAction("Action completed");
  const key = useRef(crypto.randomUUID());
  return (
    <Dialog
      open={!!spec}
      onOpenChange={(o) => {
        if (!o && !action.isPending) {
          onClose();
          action.reset();
          key.current = crypto.randomUUID();
        }
      }}
    >
      <DialogContent className="dialog-narrow">
        <span className="confirmation-icon">
          <ShieldCheck size={25} />
        </span>
        <DialogTitle>{spec?.title}</DialogTitle>
        <DialogDescription>{spec?.description}</DialogDescription>
        {action.error && <p className="form-error">{action.error.message}</p>}
        <div className="form-actions">
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() => {
              onClose();
              action.reset();
              key.current = crypto.randomUUID();
            }}
          >
            Cancel
          </Button>
          <Button
            variant={spec?.destructive ? "destructive" : "default"}
            disabled={action.isPending}
            onClick={() =>
              spec &&
              action.mutate(
                { ...spec.operation, key: key.current },
                {
                  onSuccess: () => {
                    onClose();
                    action.reset();
                    key.current = crypto.randomUUID();
                  },
                },
              )
            }
          >
            {action.isPending && (
              <LoaderCircle size={16} className="animate-spin" />
            )}
            {spec?.label || "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
