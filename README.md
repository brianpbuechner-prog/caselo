# Caselo

Caselo is an open source, browser-only tool for school counselors. It reads a
student information system (SIS) export and helps with prioritizing students
and setting goals.

Status: in development. Phase 1 is not built yet.

## Privacy model

Student data never leaves the browser.

- There is no backend, database, or account system.
- Files are read with the browser's File API and held in memory only.
- Nothing from an uploaded file is written to localStorage, IndexedDB,
  cookies, or any server.
- Closing or refreshing the tab clears all student data.
- Development and demos use synthetic data only. The `.gitignore` blocks
  `.csv`, `.tsv`, `.xls`, and `.xlsx` files everywhere except the synthetic
  sample data folder, so a real export cannot be committed by accident.

## Run locally

Requires Node.js 20 or later.

```
npm install
npm run dev
```

## License

MIT. Copyright (c) 2026 Empty Bar LLC. See [LICENSE](LICENSE).

Inter is licensed under the SIL Open Font License (see `public/fonts/OFL.txt`).
