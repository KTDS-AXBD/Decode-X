export interface DemoUser {
  userId: string;
  userName: string;
  userRole: string;
  label: string;
}

export const DEMO_USERS: DemoUser[] = [
  { userId: "admin-001", userName: "서민원", userRole: "Executive", label: "관리자" },
  { userId: "exec-001", userName: "윤대범", userRole: "Executive", label: "경영진" },
  { userId: "reviewer-001", userName: "양대진", userRole: "Reviewer", label: "정책 검토자" },
  { userId: "analyst-001", userName: "김경임", userRole: "Analyst", label: "분석 엔지니어" },
  { userId: "analyst-002", userName: "김기욱", userRole: "Analyst", label: "분석 엔지니어" },
  { userId: "developer-001", userName: "김정원", userRole: "Developer", label: "스킬 개발자" },
  { userId: "developer-002", userName: "현대영", userRole: "Developer", label: "스킬 개발자" },
];

let currentUser: DemoUser | null = null;

export function getAuthUser(): DemoUser | null {
  return currentUser;
}

export function setAuthUser(user: DemoUser | null): void {
  currentUser = user;
}
