# BBD Project Planner — solution brief for design work

You are helping refine the visual design system for an existing product. The cards in this project are the proposed design language and screens for a UX redesign. Your job is to improve how they look and feel — hierarchy, spacing, colour, component styling, screen composition — within the constraints below. The underlying product behaviour is already built and is not changing.

## What the tool is

**BBD Project Planner** is a roadmap planning web app used by BBD (a software consultancy) staff on client projects. It renders delivery roadmaps: project swimlanes on a month/week timeline, with phase bars you draw by dragging. Plans are single JSON files — saved locally or into a Microsoft Teams channel folder ("Roadmaps") via Microsoft 365 sign-in. There is no backend server; collaboration is file-based (the app detects when someone else saved the file first and offers safe merge choices).

## Who it's for

- **Primary: the plan owner** — a delivery lead who updates the roadmap weekly and presents it to stakeholders. A power user: density and speed matter, keyboard shortcuts and right-click menus are first-class.
- **Secondary: teammates** — open a shared plan occasionally to check dates or make a small edit. Must not be overwhelmed on first open.

## Core concepts (the domain model — fixed)

- **Timeline canvas** — months/weeks header, today line, weekend shading. The hero; everything else is chrome around it.
- **Sections** group **project lanes** (swimlanes); lanes hold **phase bars** (Analysis, Development, SIT, UAT, …) coloured by phase type, plus **go-live diamonds**.
- **Environments** — a bar can claim a test environment (QA, SIT…). Two bars claiming the same exclusive environment on overlapping dates = **contention**, shown as a pink ribbon on the bars and counted in a badge.
- **People & teams** — people can be assigned to bars; the same person on overlapping bars = **double-booking**, same conflict language as environments.
- **Notes** — action items attached to lanes, with an open count.
- **Display presets** — Minimal / Delivery / Workload control how much adornment bars carry (dates, environment dots, people chips, conflict ribbons). Hovering or selecting a bar always reveals its full detail.

## The redesign (why these cards exist)

The old UI grew feature-by-feature into 13 toolbar controls, three stacking side panels, and actions hidden behind right-click only. The redesign's mental model: **one canvas, one rail, one inspector** —

- **Rail**: a 44px icon strip on the right edge. Four tabs: Inspector, Notes, Environments, People. One panel open at a time. Badges (conflict counts, open notes) always live.
- **Inspector**: select anything on the canvas (bar, lane, section — or nothing = plan overview) and edit its properties there. Right-click stays as a shortcut, never the only way.
- **Command palette** (Ctrl+K): every action, jump-to-project, recent plans.
- **Toolbar diet**: 7 controls — brand mark (Home), document chip (File menu), Today, Display, Share, search pill, account.
- **Unified Home/launcher**: signed in shows your Teams and their plans; signed out shows recent local files.

## Design language

- **Dark theme default.** App background `#0b1426`, header `#0d203c`, surfaces `#102a4a` / `#16335a`. Light theme exists (white/warm greys, navy text `#1b1846`).
- **Interactive accent**: purple `#8f87f1` (primary buttons), blue `#0098cc` (selection, active states, informational badges).
- **BBD red `#ce181e` is brand-only** — the logo mark. Red is never an interactive colour; reserved for danger/destructive.
- **Conflict pink `#c0466a`** — contention and double-booking. Distinct from red on purpose.
- **Type**: Figtree, 15px page scale down to 9px micro-labels. Small, dense, confident.
- Chips: **circle = person, square = team.** Badges: pink = conflicts, blue = open notes, none at zero.

## Hard constraints — do not design against these

1. The timeline canvas rendering (SVG engine) keeps its current behaviour; restyle the chrome around it freely, the canvas conservatively.
2. PNG/PDF export captures **only the canvas region** — rail, panels, toolbar, floating controls must live outside it.
3. Keyboard shortcuts and right-click context menus survive exactly; the redesign adds visible paths, it never removes fast ones.
4. No backend: no realtime cursors, no live co-editing, no server-rendered anything. Collaboration stays file-based.
5. Don't invent new domain concepts (no new entities, fields, or data the engine doesn't have). New *presentation* of existing concepts is welcome.

## What good feedback/iteration looks like

Improve: visual hierarchy, spacing rhythm, colour balance, component polish, empty states, the composition of the four screens, accessibility of contrast. Keep the information density — this is a power tool, not a marketing site. If a change would require the engine to compute something it doesn't (see constraints), flag it instead of designing it in.
