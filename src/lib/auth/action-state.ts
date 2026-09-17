export type AuthFieldName =
  | "email"
  | "password"
  | "passwordConfirmation"
  | "fullName";

export type AuthActionState = {
  error: string | null;
  message: string | null;
  fieldErrors?: Partial<Record<AuthFieldName, string>>;
};

export const initialAuthActionState: AuthActionState = {
  error: null,
  message: null,
};
