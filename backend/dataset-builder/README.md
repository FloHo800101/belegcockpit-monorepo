# Dataset Builder (Matching Testcases)

Local, offline mini tool to create matching datasets for the engine.

## Start

```bash
cd dataset-builder
npm install
npm run dev
```

## Use

1. Click `New Case`, choose relation type and template.
2. Use `Generate Prefill`, then edit docs/txs and expected fields.
3. Click `Add Case to Dataset` to save.

Autosave uses localStorage.

## Export / Import

- Export: `Export JSON` downloads `dataset_<timestamp>.json`
- Import: `Import JSON` accepts a dataset file and loads it into the UI.
