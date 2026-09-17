export type DashboardActionState = Readonly<{
  error: string | null;
  message: string | null;
}>;

export const initialDashboardActionState: DashboardActionState = {
  error: null,
  message: null,
};
