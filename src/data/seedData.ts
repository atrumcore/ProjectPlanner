import type { Swimlane, PhaseBar, Milestone } from '../types/gantt';

let id = 0;
const uid = () => `seed-${++id}`;

// Convert a list of feature strings into a <ul> for the rich-text editor.
const ul = (items: string[]): string =>
  items.length === 0
    ? ''
    : '<ul>' + items.map(s => `<li>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('') + '</ul>';

// Delivered section swimlanes
const deliveredSwimlanes: Swimlane[] = [
  {
    id: uid(),
    projectName: 'Bank Expansion Project',
    keyFeatures: ul(['ID Reissue application', 'Bank application software', 'Bank branches', 'Bank Courier', 'Green biometric verified cohort']),
    keyDependencies: '',
    section: 'delivered',
    order: 0,
  },
  {
    id: uid(),
    projectName: 'RoC Patch 1',
    keyFeatures: ul(['General bug fixes']),
    keyDependencies: '',
    section: 'delivered',
    order: 1,
  },
  {
    id: uid(),
    projectName: 'Bank Expansion Patch 1',
    keyFeatures: ul(['General bug fixes', 'Photo resolution validation']),
    keyDependencies: '',
    section: 'delivered',
    order: 2,
  },
  {
    id: uid(),
    projectName: 'Fix Release 5',
    keyFeatures: ul(['General fixes across the system']),
    keyDependencies: '',
    section: 'delivered',
    order: 3,
  },
];

// In-progress section swimlanes
const inProgressSwimlanes: Swimlane[] = [
  {
    id: uid(),
    projectName: 'ETA/eMCS2.0 R1',
    keyFeatures: ul(['Extension on current permits', 'Emergency CR06', 'Departures', 'In Progress – No Photo', 'Enable more countries and ports']),
    keyDependencies: 'Challenges with the implementation. MQ issues. Emergency CR added complexity',
    section: 'in-progress',
    order: 0,
  },
  {
    id: uid(),
    projectName: 'Fix Release 6',
    keyFeatures: ul(['Priority fixes to be agreed with DHA']),
    keyDependencies: '',
    section: 'in-progress',
    order: 1,
  },
  {
    id: uid(),
    projectName: 'Ghost Worker',
    keyFeatures: ul(['Implementation of National Treasury ghost worker solution using QR code, NPR and facial verification capabilities']),
    keyDependencies: '',
    section: 'in-progress',
    order: 2,
  },
  {
    id: uid(),
    projectName: 'Fix Release 7',
    keyFeatures: ul(['BABS Move and Priority fixes']),
    keyDependencies: '',
    section: 'in-progress',
    order: 3,
  },
  {
    id: uid(),
    projectName: 'Fix Release 8',
    keyFeatures: ul(['Priority fixes']),
    keyDependencies: 'Critical VAS, ESB, NPR interface are outstanding. This will delay the project',
    section: 'in-progress',
    order: 4,
  },
  {
    id: uid(),
    projectName: 'ETA/eMCS2.0 R2',
    keyFeatures: ul(['Section 11(2)', 'Payments', 'OTP']),
    keyDependencies: 'BRS for Minors/Family application (ETA), BRS for Minors/Family application (EMCS 2.0), Change Request for Declarations on Biometric Capture, BRS for Section11(2) (90-day work visa). Payment assuming commercials and tariffs are agreed',
    section: 'in-progress',
    order: 5,
  },
  {
    id: uid(),
    projectName: 'ETA/eMCS2.0 R3',
    keyFeatures: ul(['Minors/Family application']),
    keyDependencies: '',
    section: 'in-progress',
    order: 6,
  },
  {
    id: uid(),
    projectName: 'ETA/eMCS2.0 R4',
    keyFeatures: ul(['Visa Verification', 'Adjudication', 'Refugee Extensions 22/24', 'Section 11(b) II, III & IV']),
    keyDependencies: '',
    section: 'in-progress',
    order: 7,
  },
  {
    id: uid(),
    projectName: 'PR & NC R1 (DEFERRED)',
    keyFeatures: ul(['Allow how you are a citizen option', 'Upfront eligibility process to enable PR & NC citizen to apply for ID docs']),
    keyDependencies: '',
    section: 'in-progress',
    order: 8,
  },
  {
    id: uid(),
    projectName: 'SARS Infra Migration',
    keyFeatures: ul(['Ongoing approach and collaboration with SARS', 'Compiling required inventory']),
    keyDependencies: '',
    section: 'in-progress',
    order: 9,
  },
  {
    id: uid(),
    projectName: 'BMD',
    keyFeatures: ul(['Conceptualisation initial BMD designs']),
    keyDependencies: '',
    section: 'in-progress',
    order: 10,
  },
  {
    id: uid(),
    projectName: 'BI',
    keyFeatures: ul(['BI reporting stack configuration using Apache SuperSet']),
    keyDependencies: '',
    section: 'in-progress',
    order: 11,
  },
  {
    id: uid(),
    projectName: 'Digital Identity',
    keyFeatures: ul(['Digital Identity project']),
    keyDependencies: 'Waiting for Altron and ENTRUST SDK and documentation',
    section: 'in-progress',
    order: 12,
  },
  {
    id: uid(),
    projectName: 'BANK Expansion Next',
    keyFeatures: ul(['Agree next Bank Expansion priorities']),
    keyDependencies: '',
    section: 'in-progress',
    order: 13,
  },
  {
    id: uid(),
    projectName: 'eHomeAffairs Replacement',
    keyFeatures: ul(['eHomeAffairs functionality migration into MyHomeAffairs Online']),
    keyDependencies: '',
    section: 'in-progress',
    order: 14,
  },
  {
    id: uid(),
    projectName: 'HANIS Switch',
    keyFeatures: ul([]),
    keyDependencies: '',
    section: 'in-progress',
    order: 15,
  },
  {
    id: uid(),
    projectName: 'HATTX',
    keyFeatures: ul([]),
    keyDependencies: '',
    section: 'in-progress',
    order: 16,
  },
  {
    id: uid(),
    projectName: 'iPR',
    keyFeatures: ul([]),
    keyDependencies: '',
    section: 'in-progress',
    order: 17,
  },
];

export const seedSwimlanes: Swimlane[] = [...deliveredSwimlanes, ...inProgressSwimlanes];

// Phase bars — week positions taken directly from draw.io (week index from Jan 1 2026).
// Delivered section bars
const deliveredBars: PhaseBar[] = [
  // Bank Expansion Project (seed-1)
  { id: uid(), swimlaneId: 'seed-1', phaseType: 'development', label: 'CIT', startWeek: 0, durationWeeks: 3 },
  { id: uid(), swimlaneId: 'seed-1', phaseType: 'sit', label: 'SIT', startWeek: 3, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-1', phaseType: 'live', label: 'BETA', startWeek: 5, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-1', phaseType: 'live', label: 'FOP', startWeek: 7, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-1', phaseType: 'live', label: 'PUBLIC', startWeek: 9, durationWeeks: 3 },
  // RoC Patch 1 (seed-2)
  { id: uid(), swimlaneId: 'seed-2', phaseType: 'uat', label: 'UAT', startWeek: 5, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-2', phaseType: 'live', label: 'LIVE', startWeek: 7, durationWeeks: 2 },
  // Bank Expansion Patch 1 (seed-3)
  { id: uid(), swimlaneId: 'seed-3', phaseType: 'uat', label: 'UAT', startWeek: 6, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-3', phaseType: 'live', label: 'LIVE', startWeek: 7, durationWeeks: 2 },
  // Fix Release 5 (seed-4)
  { id: uid(), swimlaneId: 'seed-4', phaseType: 'development', label: 'DEV', startWeek: 6, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-4', phaseType: 'uat', label: 'UAT', startWeek: 8, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-4', phaseType: 'live', label: 'LIVE', startWeek: 10, durationWeeks: 2 },
];

// In-progress section bars
const inProgressBars: PhaseBar[] = [
  // ETA/eMCS2.0 R1 (seed-5)
  { id: uid(), swimlaneId: 'seed-5', phaseType: 'analysis', label: 'ANALYSIS & DESIGN', startWeek: 1, durationWeeks: 4 },
  { id: uid(), swimlaneId: 'seed-5', phaseType: 'development', label: 'DEVELOPMENT', startWeek: 5, durationWeeks: 3 },
  { id: uid(), swimlaneId: 'seed-5', phaseType: 'development', label: 'CIT', startWeek: 8, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-5', phaseType: 'sit', label: 'SIT', startWeek: 9, durationWeeks: 3 },
  { id: uid(), swimlaneId: 'seed-5', phaseType: 'uat', label: 'UAT', startWeek: 12, durationWeeks: 3 },
  { id: uid(), swimlaneId: 'seed-5', phaseType: 'live', label: 'LIVE', startWeek: 15, durationWeeks: 2 },
  // Fix Release 6 (seed-6)
  { id: uid(), swimlaneId: 'seed-6', phaseType: 'analysis', label: 'PLANNING', startWeek: 8, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-6', phaseType: 'development', label: 'DEV', startWeek: 10, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-6', phaseType: 'sit', label: 'SIT', startWeek: 11, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-6', phaseType: 'uat', label: 'UAT', startWeek: 12, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-6', phaseType: 'live', label: 'LIVE', startWeek: 13, durationWeeks: 2 },
  // Ghost Worker (seed-7)
  { id: uid(), swimlaneId: 'seed-7', phaseType: 'development', label: 'DEV', startWeek: 10, durationWeeks: 6 },
  { id: uid(), swimlaneId: 'seed-7', phaseType: 'live', label: 'PILOT', startWeek: 16, durationWeeks: 2 },
  // Fix Release 7 (seed-8)
  { id: uid(), swimlaneId: 'seed-8', phaseType: 'analysis', label: 'PLANNING', startWeek: 9, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-8', phaseType: 'development', label: 'DEV', startWeek: 11, durationWeeks: 4 },
  { id: uid(), swimlaneId: 'seed-8', phaseType: 'sit', label: 'SIT', startWeek: 15, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-8', phaseType: 'uat', label: 'UAT', startWeek: 16, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-8', phaseType: 'live', label: 'LIVE', startWeek: 17, durationWeeks: 2 },
  // Fix Release 8 (seed-9)
  { id: uid(), swimlaneId: 'seed-9', phaseType: 'analysis', label: 'PLANNING', startWeek: 11, durationWeeks: 2 },
  { id: uid(), swimlaneId: 'seed-9', phaseType: 'development', label: 'DEV', startWeek: 13, durationWeeks: 4 },
  { id: uid(), swimlaneId: 'seed-9', phaseType: 'sit', label: 'SIT', startWeek: 17, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-9', phaseType: 'uat', label: 'UAT', startWeek: 18, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-9', phaseType: 'live', label: 'LIVE', startWeek: 19, durationWeeks: 2 },
  // ETA/eMCS2.0 R2 (seed-10)
  { id: uid(), swimlaneId: 'seed-10', phaseType: 'analysis', label: 'ANALYSIS & DESIGN', startWeek: 0, durationWeeks: 12 },
  { id: uid(), swimlaneId: 'seed-10', phaseType: 'development', label: 'DEVELOPMENT', startWeek: 12, durationWeeks: 4 },
  { id: uid(), swimlaneId: 'seed-10', phaseType: 'development', label: 'CIT', startWeek: 16, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-10', phaseType: 'sit', label: 'SIT', startWeek: 17, durationWeeks: 3 },
  { id: uid(), swimlaneId: 'seed-10', phaseType: 'uat', label: 'UAT', startWeek: 20, durationWeeks: 1 },
  { id: uid(), swimlaneId: 'seed-10', phaseType: 'live', label: 'LIVE', startWeek: 21, durationWeeks: 2 },
  // ETA/eMCS2.0 R3 (seed-11) — draw.io only has analysis + start dev
  { id: uid(), swimlaneId: 'seed-11', phaseType: 'analysis', label: 'ANALYSIS & DESIGN', startWeek: 0, durationWeeks: 13 },
  { id: uid(), swimlaneId: 'seed-11', phaseType: 'development', label: 'START DEV', startWeek: 13, durationWeeks: 2 },
  // ETA/eMCS2.0 R4 (seed-12)
  { id: uid(), swimlaneId: 'seed-12', phaseType: 'analysis', label: 'ANALYSIS & DESIGN', startWeek: 8, durationWeeks: 8 },
  // PR & NC R1 (DEFERRED) (seed-13)
  { id: uid(), swimlaneId: 'seed-13', phaseType: 'analysis', label: 'ANALYSIS & DESIGN', startWeek: 0, durationWeeks: 8 },
  { id: uid(), swimlaneId: 'seed-13', phaseType: 'development', label: 'DEVELOPMENT', startWeek: 8, durationWeeks: 4 },
  // SARS Infra Migration (seed-14)
  { id: uid(), swimlaneId: 'seed-14', phaseType: 'analysis', label: 'PLANNING & INVENTORY', startWeek: 4, durationWeeks: 12 },
  // BMD (seed-15)
  { id: uid(), swimlaneId: 'seed-15', phaseType: 'concept', label: 'CONCEPTUALISATION', startWeek: 4, durationWeeks: 6 },
  { id: uid(), swimlaneId: 'seed-15', phaseType: 'analysis', label: 'WORKSHOPS', startWeek: 10, durationWeeks: 3 },
  // BI (seed-16)
  { id: uid(), swimlaneId: 'seed-16', phaseType: 'development', label: 'SERVER PROVISIONING & CONFIG', startWeek: 4, durationWeeks: 10 },
  { id: uid(), swimlaneId: 'seed-16', phaseType: 'development', label: 'DEMO', startWeek: 14, durationWeeks: 2 },
  // Digital Identity (seed-17)
  { id: uid(), swimlaneId: 'seed-17', phaseType: 'concept', label: 'CONCEPTUALISATION', startWeek: 7, durationWeeks: 7 },
  // BANK Expansion Next (seed-18)
  { id: uid(), swimlaneId: 'seed-18', phaseType: 'analysis', label: 'PLANNING', startWeek: 10, durationWeeks: 6 },
  // eHomeAffairs Replacement (seed-19)
  { id: uid(), swimlaneId: 'seed-19', phaseType: 'analysis', label: 'ANALYSIS & DESIGN', startWeek: 4, durationWeeks: 8 },
];

export const seedPhaseBars: PhaseBar[] = [...deliveredBars, ...inProgressBars];

export const seedMilestones: Milestone[] = [
  // Delivered
  { id: uid(), swimlaneId: 'seed-1', week: 5 },
  { id: uid(), swimlaneId: 'seed-2', week: 7 },
  { id: uid(), swimlaneId: 'seed-3', week: 7 },
  { id: uid(), swimlaneId: 'seed-4', week: 10 },
  // In Progress
  { id: uid(), swimlaneId: 'seed-5', week: 15 },
  { id: uid(), swimlaneId: 'seed-6', week: 13 },
  { id: uid(), swimlaneId: 'seed-7', week: 16 },
  { id: uid(), swimlaneId: 'seed-8', week: 17 },
  { id: uid(), swimlaneId: 'seed-9', week: 19 },
  { id: uid(), swimlaneId: 'seed-10', week: 21 },
];
