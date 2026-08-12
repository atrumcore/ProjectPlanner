/**
 * The AI-facing plan format — the "contract" of the planner skill.
 *
 * One shape is used in both directions: the projection of the current
 * document sent to Claude and the plan Claude returns are the same format,
 * so the system prompt can simply say "return this same format, modified".
 *
 * Deliberately simpler than the app's internal model:
 *  - real calendar dates (YYYY-MM-DD) instead of fractional week offsets
 *  - names instead of ids for cross-references (people, teams, sections)
 *  - `ref`/`id` echoes so existing entities survive round-trips
 * The deterministic mapping to/from the internal model lives in
 * `aiPlanConvert.ts`.
 */

export interface AiPhase {
  /** Echo of an existing bar id, or any new unique string for new phases. */
  ref: string;
  /** Built-in key (analysis|development|sit|uat|live|concept|custom) or the
   * name of a custom phase type present in the document. */
  typeKey: string;
  /** Display text on the bar; null = the phase type's default label. */
  label: string | null;
  startDate: string;
  endDate: string;
  /** People executing this phase, by name. */
  assigneeNames: string[];
  /** Teams executing this phase, by name. */
  teamNames: string[];
}

export interface AiMilestone {
  date: string;
}

export interface AiProject {
  /** Echo of an existing swimlane id; null for new projects. */
  id: string | null;
  name: string;
  /** Section name this project belongs to. */
  section: string;
  featureBullets: string[];
  dependencyBullets: string[];
  /** Project owners (label chips), by name. */
  ownerPersonNames: string[];
  ownerTeamNames: string[];
  phases: AiPhase[];
  milestones: AiMilestone[];
}

export interface AiPlanDoc {
  /** Calendar date the timeline starts; the app anchors to the 1st of that
   * month. Kept from the current document unless the document is empty. */
  timelineStart: string;
  /** Display order = array order. */
  sections: { name: string }[];
  teams: { name: string }[];
  people: { name: string; role: string | null; teamName: string | null }[];
  projects: AiProject[];
  /** Finish-to-start arrows between phases, by phase ref. */
  dependencies: { fromRef: string; toRef: string }[];
}

export interface AiPlanResponse {
  /** 2–6 sentence chat reply describing what was created/changed. */
  summary: string;
  plan: AiPlanDoc;
}

/* ------------------------------------------------------------------ */
/* JSON schema for structured outputs.                                 */
/* Constraints of the structured-outputs feature: every object sets    */
/* additionalProperties:false and lists every property in `required`;  */
/* nullability via type arrays; no recursion, no min/max/pattern.      */
/* ------------------------------------------------------------------ */

const PHASE_SCHEMA = {
  type: 'object',
  properties: {
    ref: { type: 'string', description: 'Echo existing bar id, or a new unique short string.' },
    typeKey: {
      type: 'string',
      description: "One of analysis|development|sit|uat|live|concept|custom, or a custom phase type's name from the document.",
    },
    label: { type: ['string', 'null'], description: "Display text on the bar; null = phase type's default." },
    startDate: { type: 'string', format: 'date' },
    endDate: { type: 'string', format: 'date' },
    assigneeNames: { type: 'array', items: { type: 'string' } },
    teamNames: { type: 'array', items: { type: 'string' } },
  },
  required: ['ref', 'typeKey', 'label', 'startDate', 'endDate', 'assigneeNames', 'teamNames'],
  additionalProperties: false,
};

const PROJECT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: ['string', 'null'], description: 'Echo existing swimlane id; null for new projects.' },
    name: { type: 'string' },
    section: { type: 'string', description: 'Must match a section name in the sections list.' },
    featureBullets: { type: 'array', items: { type: 'string' } },
    dependencyBullets: { type: 'array', items: { type: 'string' } },
    ownerPersonNames: { type: 'array', items: { type: 'string' } },
    ownerTeamNames: { type: 'array', items: { type: 'string' } },
    phases: { type: 'array', items: PHASE_SCHEMA },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        properties: { date: { type: 'string', format: 'date' } },
        required: ['date'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'id', 'name', 'section', 'featureBullets', 'dependencyBullets',
    'ownerPersonNames', 'ownerTeamNames', 'phases', 'milestones',
  ],
  additionalProperties: false,
};

export const AI_PLAN_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Chat reply: 2–6 short sentences on what was created/changed.' },
    plan: {
      type: 'object',
      properties: {
        timelineStart: { type: 'string', format: 'date' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
        teams: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
        people: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: ['string', 'null'], description: 'Short tag like "BA" or "Backend Dev".' },
              teamName: { type: ['string', 'null'] },
            },
            required: ['name', 'role', 'teamName'],
            additionalProperties: false,
          },
        },
        projects: { type: 'array', items: PROJECT_SCHEMA },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fromRef: { type: 'string' },
              toRef: { type: 'string' },
            },
            required: ['fromRef', 'toRef'],
            additionalProperties: false,
          },
        },
      },
      required: ['timelineStart', 'sections', 'teams', 'people', 'projects', 'dependencies'],
      additionalProperties: false,
    },
  },
  required: ['summary', 'plan'],
  additionalProperties: false,
};
