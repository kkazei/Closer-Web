export type LeadSignalFields = Readonly<{
  name: string | null;
  email: string | null;
  company: string | null;
  role: string | null;
  companySize: string | null;
  useCase: string | null;
  budget: string | null;
  timeline: string | null;
  productInterest: string | null;
  buyingIntent: string | null;
}>;

export type LeadExtraction = LeadSignalFields &
  Readonly<{
    qualificationComplete: boolean;
  }>;

export const LEAD_QUALIFICATION_STATUSES = [
  "new",
  "qualifying",
  "qualified",
  "unqualified",
] as const;

export type LeadQualificationStatus =
  (typeof LEAD_QUALIFICATION_STATUSES)[number];

export type LeadScoreBreakdown = Readonly<{
  fit: number;
  intent: number;
  readiness: number;
}>;

export type LeadQualificationResult = Readonly<{
  qualificationStatus: LeadQualificationStatus;
  score: number;
  scoreBreakdown: LeadScoreBreakdown;
  scoreExplanation: string;
}>;

const MAX_FIT_SCORE = 35;
const MAX_INTENT_SCORE = 35;
const MAX_READINESS_SCORE = 30;

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function containsAny(value: string | null | undefined, terms: readonly string[]) {
  const text = normalized(value);
  return terms.some((term) => text.includes(term));
}

export function hasLeadSignal(input: Partial<LeadSignalFields>): boolean {
  return (
    hasValue(input.name) ||
    hasValue(input.email) ||
    hasValue(input.company) ||
    hasValue(input.role) ||
    hasValue(input.companySize) ||
    hasValue(input.useCase) ||
    hasValue(input.budget) ||
    hasValue(input.timeline) ||
    hasValue(input.productInterest) ||
    hasValue(input.buyingIntent)
  );
}

/**
 * The minimum set of explicit signals needed before a lead can be marked
 * qualified. This is intentionally independent of the model's final score.
 */
export function hasMinimumQualificationSignals(
  input: LeadSignalFields,
): boolean {
  return (
    hasValue(input.useCase) &&
    (hasValue(input.productInterest) || hasValue(input.company)) &&
    hasValue(input.timeline) &&
    hasValue(input.buyingIntent) &&
    (hasValue(input.email) || hasValue(input.name))
  );
}

function calculateFitScore(input: LeadSignalFields): number {
  let score = 0;

  if (hasValue(input.company)) score += 8;
  if (hasValue(input.role)) score += 6;
  if (hasValue(input.companySize)) score += 5;
  if (hasValue(input.useCase)) score += 10;
  if (hasValue(input.productInterest)) score += 6;

  return Math.min(score, MAX_FIT_SCORE);
}

function calculateIntentScore(input: LeadSignalFields): number {
  const intent = normalized(input.buyingIntent);

  if (!intent) return 0;
  if (containsAny(intent, ["not interested", "no interest", "not ready"])) {
    return 0;
  }
  if (containsAny(intent, ["high", "urgent", "ready", "actively evaluating"])) {
    return MAX_INTENT_SCORE;
  }
  if (containsAny(intent, ["medium", "moderate", "comparing", "interested"])) {
    return 22;
  }
  if (containsAny(intent, ["low", "researching", "exploring", "browsing"])) {
    return 10;
  }

  return 5;
}

function calculateReadinessScore(input: LeadSignalFields): number {
  let score = 0;

  if (hasValue(input.budget)) score += 10;
  if (hasValue(input.timeline)) score += 10;
  if (hasValue(input.email)) score += 5;
  if (hasValue(input.name)) score += 5;

  return Math.min(score, MAX_READINESS_SCORE);
}

function isExplicitlyUnqualified(input: LeadSignalFields): boolean {
  return (
    containsAny(input.buyingIntent, [
      "not interested",
      "no interest",
      "no plans",
      "not a fit",
    ]) ||
    containsAny(input.timeline, ["no plans", "not planning", "not now"])
  );
}

export function calculateLeadQualification(
  input: LeadExtraction,
): LeadQualificationResult {
  const fit = calculateFitScore(input);
  const intent = calculateIntentScore(input);
  const readiness = calculateReadinessScore(input);
  const score = fit + intent + readiness;
  const hasSignal = hasLeadSignal(input);
  const minimumSignals = hasMinimumQualificationSignals(input);
  const complete = input.qualificationComplete || minimumSignals;

  let qualificationStatus: LeadQualificationStatus = "qualifying";

  if (!hasSignal) {
    qualificationStatus = "new";
  } else if (isExplicitlyUnqualified(input)) {
    qualificationStatus = "unqualified";
  } else if (complete && minimumSignals && score >= 70) {
    qualificationStatus = "qualified";
  } else if (complete && minimumSignals && intent <= 10) {
    qualificationStatus = "unqualified";
  }

  const scoreExplanation =
    `Deterministic score: ${score}/100 ` +
    `(fit ${fit}/${MAX_FIT_SCORE}, intent ${intent}/${MAX_INTENT_SCORE}, ` +
    `readiness ${readiness}/${MAX_READINESS_SCORE}). ` +
    `Qualification status: ${qualificationStatus}.`;

  return {
    qualificationStatus,
    score,
    scoreBreakdown: { fit, intent, readiness },
    scoreExplanation,
  };
}
