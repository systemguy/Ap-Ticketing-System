// Single source of truth for departments (teams) and the services each one handles.
// Used by both the Services page and the ticket form so the two never drift apart.
// Matches the departments and services set up in the database.
export const departmentServices = {
  HVAC: ['ac repair'],
  Plumbing: ['pipe repairs', 'infiltration repairs'],
  Electrical: ['wiring fixes', 'lighting repairs'],
  OIT: ['network setup', 'hardware fix'],
};

export const departments = Object.keys(departmentServices);
