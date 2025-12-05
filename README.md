# gOS Case Report (prebuilt)

This repository now ships prebuilt bundles via **GitHub Releases** and publishes the latest build to **GitHub Pages**. You can run the app locally without rebuilding, explore the demo data baked into `shared/`, or develop from source with the usual React tooling.

![Genome view screenshot](screenshots/gos_genome_view.png)

## Quick start (no build required)
Prereqs: `python3`, `curl`, and `tar`. Optionally set `GITHUB_TOKEN` to avoid GitHub API rate limits.

```bash
./setup.sh
open http://localhost:3001
```

What happens:
- Fetches the latest GitHub Release for `mskilab/case-report` (override with `REPO=owner/repo` or `TAG=v1.2.3`).
- Downloads `build-<sha>.tar.gz`, its checksum, and the `LATEST` metadata, verifies the checksum, and unpacks into `out/build-<sha>/`.
- Copies the `shared/` data into the unpacked build.
- Serves the static app on `PORT` (default `3001`). Set `SKIP_SERVER=1` to skip launching the server.

## Developing from source
```bash
yarn install --frozen-lockfile
CI=false yarn start   # dev server on http://localhost:3000
yarn test             # interactive tests
CI=false yarn build   # production build into ./build
```

## Shared data bundle
The `shared/` directory contains the minimum data/config the UI expects:
- `shared/datasets.json` – datasets the UI lists in the sidebar.
- `shared/datafiles.json` – maps dataset identifiers to files on disk.
- `shared/settings.json` – defaults for theme, landing dataset, feature toggles.
- `shared/data/`, `shared/common/`, `shared/genes/`, etc. – sample payloads that back the demo experience.

Add your own case report data by mirroring the structure above and updating the JSON manifests accordingly.

### Configuring datasets

The `datasets.json` file defines available datasets and their configuration. Each dataset entry supports:

```json
{
  "id": "my-dataset",
  "title": "My Dataset",
  "datafilesPath": "datafiles.json",
  "commonPath": "common/",
  "dataPath": "data/",
  "reference": "hg19",
  "optionalFilteredEventsColumns": [
    {
      "id": "custom-col",
      "title": "Custom Column",
      "dataIndex": "customField",
      "viewType": "gene-link"
    }
  ],
  "schema": [
    {
      "id": "sample_type",
      "title": "Sample Type",
      "type": "string"
    }
  ]
}
```

**Filtered Events Columns:** Extend the filtered events list columns using `optionalFilteredEventsColumns`. Supports partial column definitions that merge with defaults. Available `viewType` renderers:
- `"gene-link"` – renders gene names as clickable links
- `"tier-badge"` – renders tier/category badges
- `"formatted-number"` – renders formatted numeric values
- `"string-basic"` – renders plain text (default)
- `"location-link"` – renders genomic locations as links
- `"class-icon"` – renders class with icon

**Cohort Filters:** Define dataset-specific filters for the cohort-level view using `schema`. When provided, this overrides the default schema from settings. Each filter must include `id`, `title`, and `type`.

## Deployments
- **Releases:** `.github/workflows/build-artifacts.yml` builds on `main`, uploads the tarball/checksum/LATEST files to a GitHub Release, and marks it as the latest.
- **GitHub Pages:** The same workflow uploads the built `build/` directory as a Pages artifact and deploys it to the `github-pages` environment. The live site always matches the newest release.

The legacy `deploy-builds` branch is no longer used; artifacts now live solely on GitHub Releases.

## Troubleshooting
- If downloads fail, set `GITHUB_TOKEN` (PAT or Actions token) to raise the GitHub API limit.
- If the checksum mismatches, rerun `./setup.sh` to redownload the assets.
- Ensure `python3` is on your `PATH`; it powers the local HTTP server.
