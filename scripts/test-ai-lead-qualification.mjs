import assert from "node:assert/strict";

const { normalizeLeadExtraction } = await import(
  "../src/ai/lead-extraction.ts"
);
const {
  calculateLeadQualification,
  hasMinimumQualificationSignals,
} = await import("../src/lib/lead-qualification.ts");

const complete = normalizeLeadExtraction({
  name: " Alex Morgan ",
  email: "ALEX.MORGAN@EXAMPLE.TEST",
  company: "Orbit Systems",
  role: "Head of Revenue",
  companySize: "51-200",
  useCase: "Qualify inbound demo requests.",
  budget: "$2,000-$5,000/month",
  timeline: "This quarter",
  productInterest: "Website qualification assistant",
  buyingIntent: "High",
  qualificationComplete: true,
});

assert.equal(complete.name, "Alex Morgan");
assert.equal(complete.email, "alex.morgan@example.test");
assert.equal(hasMinimumQualificationSignals(complete), true);

const aliased = normalizeLeadExtraction({
  companyName: "Orbit Systems",
  jobTitle: "Head of Revenue",
  launchTimeline: "This quarter",
  qualificationComplete: false,
});
assert.equal(aliased.company, "Orbit Systems");
assert.equal(aliased.role, "Head of Revenue");
assert.equal(aliased.timeline, "This quarter");

const completeQualification = calculateLeadQualification(complete);
assert.equal(completeQualification.score, 100);
assert.deepEqual(completeQualification.scoreBreakdown, {
  fit: 35,
  intent: 35,
  readiness: 30,
});
assert.equal(completeQualification.qualificationStatus, "qualified");

const partial = normalizeLeadExtraction({
  name: "Priya Shah",
  email: "not-an-email",
  useCase: "Answer product questions for visitors.",
  productInterest: "Product Q&A",
  buyingIntent: "Medium",
  qualificationComplete: false,
});

assert.equal(partial.email, null);
assert.equal(
  calculateLeadQualification(partial).qualificationStatus,
  "qualifying",
);

const unqualified = normalizeLeadExtraction({
  useCase: "Maybe evaluate a product later.",
  productInterest: "General information",
  buyingIntent: "Not interested",
  timeline: "No plans",
  qualificationComplete: true,
});

assert.equal(
  calculateLeadQualification(unqualified).qualificationStatus,
  "unqualified",
);

assert.throws(
  () =>
    normalizeLeadExtraction({
      qualificationComplete: false,
      unexpected: "must be rejected",
    }),
  /unexpected/i,
);

console.log("AI lead extraction and deterministic scoring tests passed.");
