import { normalizeLeadExtraction } from "@/ai/lead-extraction";

describe("lead extraction normalization", () => {
  it("maps supported aliases, trims fields, and normalizes email", () => {
    const result = normalizeLeadExtraction({
      fullName: "  Alex Rivera ",
      emailAddress: " ALEX@EXAMPLE.COM ",
      companyName: " Northstar Labs ",
      use_case: "  Automate qualification  ",
      qualification_complete: true,
    });

    expect(result).toEqual({
      name: "Alex Rivera",
      email: "alex@example.com",
      company: "Northstar Labs",
      role: null,
      companySize: null,
      useCase: "Automate qualification",
      budget: null,
      timeline: null,
      productInterest: null,
      buyingIntent: null,
      qualificationComplete: true,
    });
  });

  it("rejects malformed email data without storing it", () => {
    const result = normalizeLeadExtraction({
      email: "not-an-email",
      qualificationComplete: false,
    });

    expect(result.email).toBeNull();
  });

  it("rejects unknown extraction fields", () => {
    expect(() =>
      normalizeLeadExtraction({
        qualificationComplete: false,
        score: 99,
      }),
    ).toThrow();
  });
});
