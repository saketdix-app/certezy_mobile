// Same API the website uses (certezy.com serves /api/v1).
export const API_BASE = "https://certezy.com/api/v1";

/** Who may use the team app. Students are sent to the website. */
export const TEAM_ROLES = ["consultant", "exam_coordinator", "admin", "super_admin"] as const;

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  sub_admin: "Sub-Admin",
  consultant: "Consultant",
  exam_coordinator: "Exam Coordinator",
};
