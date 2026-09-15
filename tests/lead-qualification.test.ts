import {
  calculateLeadQualification,
  hasLeadSignal,
  hasMinimumQualificationSignals,
  type LeadExtraction,
} from "@/lib/lead-qualification";

function lead(overrides: Partial<LeadExtraction> = {}): LeadExtraction {
  return {
    name: null,
    email: null,
    company: null,
    role: null,
    companySize: null,
    useCase: null,
    budget: null,
    timeline: null,
    productInterest: null,
    buyingIntent: null,
    qualificationComplete: false,
    ...overrides,
  };
}

describe("deterministic lead qualification", () => {
  it("keeps a signal-free conversation as a new lead", () => {
    const result = calculateLeadQualification(lead());

    expect(hasLeadSignal(lead())).toBe(false);
    expect(result).toMatchObject({
      qualificationStatus: "new",
      score: 0,
      scoreBreakdown: { fit: 0, intent: 0, readiness: 0 },
    });
  });

  it("requires the explicit minimum signals before qualification", () => {
    const partial = lead({
      name: "Alex",
      company: "Northstar",
      useCase: "Automate lead qualification",
      buyingIntent: "actively evaluating",
      qualificationComplete: true,
    });

    expect(hasMinimumQualificationSignals(partial)).toBe(false);
    expect(calculateLeadQualification(partial).qualificationStatus).toBe(
      "qualifying",
    );
  });

  it("calculates a maximum qualified score from stored signals", () => {
    const result = calculateLeadQualification(
      lead({
        name: "Alex Rivera",
        email: "alex@example.com",
        company: "Northstar Labs",
        role: "VP Sales",
        companySize: "51-200",
        useCase: "Automate lead qualification",
        productInterest: "AI sales assistant",
        budget: "$20k",
        timeline: "This quarter",
        buyingIntent: "actively evaluating",
        qualificationComplete: true,
      }),
    );

    expect(result).toEqual({
      qualificationStatus: "qualified",
      score: 100,
      scoreBreakdown: { fit: 35, intent: 35, readiness: 30 },
      scoreExplanation: expect.stringContaining("Deterministic score: 100/100"),
    });
  });

  it("prioritizes explicit negative intent over completion", () => {
    const result = calculateLeadQualification(
      lead({
        name: "Taylor",
        email: "taylor@example.com",
        company: "Example Co",
        useCase: "Review options",
        productInterest: "Sales automation",
        timeline: "This quarter",
        buyingIntent: "not interested",
        qualificationComplete: true,
      }),
    );

    expect(result.qualificationStatus).toBe("unqualified");
    expect(result.scoreExplanation).toContain("Qualification status: unqualified");
  });
});
