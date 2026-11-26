// Shapes returned by backend/src/routes/org.js.

export interface Department {
  id: number;
  code: string;
  name: string;
  default_role_family: string | null;
  head_employee_id: number | null;
  head_name?: string | null;
  is_active: number;
  n_employees?: number;
}

export interface Employee {
  id: number;
  user_id: number | null;
  staff_no: string;
  full_name: string;
  email: string | null;
  department_id: number;
  department_name: string;
  department_code: string;
  job_title: string | null;
  gender: "Male" | "Female" | null;
  role_family: string;
  line_manager_id: number | null;
  line_manager_name: string | null;
  line_manager_staff_no: string | null;
  branch_id: number | null;
  branch_name: string | null;
  hire_date: string | null;
  probation_end_date: string | null;
  confirmation_date: string | null;
  exit_date: string | null;
  exit_reason: string | null;
  status: "Probation" | "Confirmed" | "Exited";
  username: string | null;
  user_role: string | null;
}

export interface OrgMeta {
  departments: Pick<Department, "id" | "code" | "name" | "default_role_family" | "is_active">[];
  roleFamilies: string[];
  statuses: string[];
  genders: string[];
  appraisalRoles: { role: string; label: string; description: string }[];
  users: { id: number; username: string; role: string; employee_id: number | null; employee_name: string | null }[];
  managers: { id: number; staff_no: string; full_name: string; job_title: string | null }[];
  branches: { id: number; name: string }[];
}

export const STATUS_BADGE: Record<string, string> = {
  Probation: "badge-pending",
  Confirmed: "badge-paid",
  Exited: "badge-cancelled",
};
