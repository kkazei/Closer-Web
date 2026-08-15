export type AuthActionState = {
  error: string | null;
  message: string | null;
};

export const initialAuthActionState: AuthActionState = {
  error: null,
  message: null,
};
