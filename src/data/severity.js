// Severity levels (1-4) sent to the backend. Higher number = more severe.
export const SEVERITIES = [
  { value: 1, label: 'Low', description: 'Cosmetic, no impact on daily use' },
  { value: 2, label: 'Moderate', description: 'Inconvenient, but there is a workaround' },
  { value: 3, label: 'High', description: 'Part of the unit is unusable (e.g. no AC or hot water)' },
  { value: 4, label: 'Critical', description: 'Safety risk or building-wide (e.g. flooding, gas smell, no heat in winter)' },
];

export const severityOf = (value) => SEVERITIES.find((s) => s.value === Number(value));
