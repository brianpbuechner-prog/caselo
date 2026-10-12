# Caselo

Caselo is an open source, browser-only tool for school counselors. It reads a
student information system (SIS) export, flags students who may need support
using rules you can see and adjust, and sorts them into tiers. With more than
one export from different points in the year, it also shows what changed.

Live site: https://caselo.org

## What it does

- Reads 1 to 4 exports. Each file gets a label (for example Q1 or Q2). Files
  with the same label are combined into one snapshot, so a Q2 student file and
  a Q2 behavior file are read together. Snapshots are compared in order.
- Detects the delimiter (comma, tab, pipe, or caret) and matches columns to
  known fields. The detected mapping is shown so you can confirm or correct
  it, and a mapping can be downloaded as JSON and loaded again later.
- Detects whether a file has one row per student or many (behavior incidents,
  attendance marks, course grades) and groups many-row files by student.
- Runs three rules, each with thresholds you can change:
  - Attendance: chronic absence at 10% or more of scheduled days.
  - Academics: GPA below 2.0, or one or more failing course grades when
    course grades are in the file.
  - Behavior: 3 or more incidents.
- Assigns Tier 1 (no flags), Tier 2 (1 flag), or Tier 3 (2 or more flags).
  A student gets at most one flag per category.
- Shows the results on one page: how many students have no flags and what
  changed since the last snapshot, a short "start here" section, patterns
  (flag rates by grade, how flags overlap, and how students are spread around
  each rule), and the full student list with the rule behind every flag.
  Selecting a student shows their values in every snapshot. The list exports
  to CSV in the browser.
- The "start here" section depends on the role chosen. Counselors see five
  students. Administrators see the grades and areas with the highest rates,
  with no names.
- Says clearly which categories were not in your files, and runs only the
  rules that apply.

## Privacy model

Student data never leaves the browser.

- There is no backend, database, account system, or analytics.
- Files are read with the browser's File API and held in memory. Parsing and
  queries run in DuckDB-WASM inside a Web Worker with an in-memory database.
- Nothing from an uploaded file is written to localStorage, IndexedDB,
  cookies, or any server. Closing or refreshing the tab clears it, and the
  "Clear data" button stops the DuckDB worker and discards its memory.
- A Content Security Policy (in `vercel.json` and in the built page) only
  allows the page to connect to its own site. Fonts and the DuckDB WebAssembly
  files are served from the site itself, not a CDN.
- Settings that contain no student data (role, thresholds, table density) are
  saved in localStorage so they persist between visits.
- Development and demos use synthetic data only. The `.gitignore` blocks
  `.csv`, `.tsv`, `.xls`, and `.xlsx` files everywhere except
  `public/sample-data/`, so a real export cannot be committed by accident.

## Run locally

Requires Node.js 20 or later.

```
npm install
npm run dev          # start the app at http://localhost:5173
npm test             # run the tests
npm run build        # production build in dist/
npm run sample-data  # regenerate the synthetic sample files
```

## Infinite Campus fields it recognizes

Caselo reads Infinite Campus Ad Hoc exports from Filter Designer, Query
Wizard, or Data Export. Default header names come from public Infinite Campus
documentation. Districts can rename columns, so each field also has
plain-language aliases for fuzzy matching (for example "Grade Level" or
"Absence %").

| Category | Default headers |
|---|---|
| Student identity | `student.studentNumber`, `student.stateID`, `student.lastName`, `student.firstName`, `student.grade` |
| Attendance summary | `attChronicAbsenteeism.absenteeismPercentage`, `attChronicAbsenteeism.daysAbsent`, `attChronicAbsenteeism.scheduledDays`, `attChronicAbsenteeism.chronicallyAbsent` (1 or 0) |
| GPA | `cumGPA.cumGPA`, `unweightedGPA.cumGPA` |
| Behavior | `behaviorDetail.incidentID`, `behaviorDetail.incidentDate`, `behaviorDetail.resolutionCode` |
| Attendance detail | `AttendanceDetail.date`, `AttendanceDetail.code` |
| Course grades | `gradingDetail.courseName`, `gradingDetail.score` (unverified guess) |

Notes:

- When `absenteeismPercentage` is present, Caselo uses it directly. It
  reflects the district's own attendance calculation method, and the results
  page says so. Otherwise Caselo computes the rate from days absent and
  scheduled days, or from counted attendance detail rows divided by scheduled
  days. For attendance detail, you choose which codes count as absent.
- Course grade field names have not been checked against a real export, so
  failing-grade detection is a best guess until they are.
- Fields vary by district. A real header row will make detection better.

## Project structure

```
src/
  config/rules.ts              every threshold and default
  lib/
    files/                     decode text, detect delimiter, read files
    db/                        DuckDB-WASM setup (browser) and the SqlRunner interface
    sis/                       field catalogs: types, registry, infinite-campus/fields.ts
    mapping/                   default and fuzzy column detection, mapping JSON
    grouping/                  row shape detection, per-student rollups, snapshots
    rules/engine.ts            flags, reasons, and tiers
    compare/analyze.ts         caseload summaries and change between snapshots
    compare/insights.ts        patterns: grade rates, overlap, distributions, start here
    export/csv.ts              results CSV
    roles/roles.ts             roles and what the start here section shows
    preferences.ts             saved settings (no student data)
  components/                  React UI
tests/                         Vitest tests, run against the synthetic data
scripts/generate-sample-data.mjs
public/sample-data/            synthetic exports (about 300 invented students)
```

The rules engine is plain TypeScript, separate from DuckDB, so it is easy to
read and test. DuckDB handles parsing and grouping.

## Adding another export or SIS

1. Create a catalog in `src/lib/sis/<sis-name>/fields.ts` that follows
   `SisCatalog` in `src/lib/sis/types.ts`. For each field, give its category,
   the SIS's default header names, and plain-language aliases.
2. Set `requirements`, which says which fields must be present for each
   category to count, and `studentKeys`, which lists the ID fields in order of
   preference.
3. Add the catalog to `CATALOGS` in `src/lib/sis/registry.ts`.
4. Add a synthetic sample file to `public/sample-data/` and tests in
   `tests/mapping.test.ts`.

New fields in an existing category work without other changes. A new
category also needs a rollup expression in `src/lib/grouping/rollup.ts` and,
if it should be flagged, a rule in `src/lib/rules/engine.ts` with its
thresholds in `src/config/rules.ts`.

## Later phases (planned, not built)

- Phase 2: a de-identified summary with counts and rates only, no names or
  IDs, and small-cell suppression (under 10 shown as "<10"). Planned home:
  `src/lib/summary/`.
- Phase 3: AI narrative and goal drafting from the Phase 2 summary only,
  aligned to the ASCA model. It will never rank or flag individual students.
  The model call will sit behind one interface in `src/lib/ai/` so the key
  handling choice can change.
- Phase 4: community context by zip code from the Census ACS API.
- More export types, SIS platforms, and roles.

## Credits and license

Created by Brian Buechner, licensed Minnesota school counselor.

MIT License. Copyright (c) 2026 Empty Bar LLC. See [LICENSE](LICENSE).

Inter is licensed under the SIL Open Font License (see `public/fonts/OFL.txt`).
