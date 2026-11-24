import { schoolApi } from "../../lib/api";
import type { DashboardOverview } from "./types";

export async function getDashboardOverview(schoolId: string) {
  return schoolApi<DashboardOverview>("dashboard.get", { schoolId });
}
