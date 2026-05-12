import { z } from 'zod';

export const SeveritySchema = z.enum(['must-fix', 'should-fix', 'consider']);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingSchema = z.object({
  severity: SeveritySchema,
  file: z.string(),
  line: z.number().int().positive().optional(),
  title: z.string().max(80),
  body: z.string(),
  suggestion: z.string().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ReviewSchema = z.object({
  summary: z.string(),
  findings: z.array(FindingSchema),
});
export type Review = z.infer<typeof ReviewSchema>;

export const SEVERITY_ORDER: Record<Severity, number> = {
  'must-fix': 0,
  'should-fix': 1,
  'consider': 2,
};

export function meetsThreshold(finding: Finding, minSeverity: Severity): boolean {
  return SEVERITY_ORDER[finding.severity] <= SEVERITY_ORDER[minSeverity];
}
