# BitForge

BitForge is a local-first digital logic studio with a visual circuit editor, live simulation, campaign challenges, independent projects, and reusable circuit blueprints. No account, database, or environment variables are required.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Create and preview a production build:

```bash
npm run build
npm run preview
```


## Features

- Animated, responsive landing page with separate Sandbox, dedicated Campaign hub, Projects, and Blueprint areas. Campaign exploration happens on its own screen; choosing a challenge opens that level editor. Campaign navigation is not shown in the sandbox sidebar.
- Create and manage multiple circuit projects.
- Autosave projects, blueprints, keyboard bindings, campaign progress, and workspace settings in this browser.
- Save named blueprints with optional descriptions and circuit previews. Use **Select area** in the editor to drag a rectangle around just the gates, wires, and other blocks you want, then choose **Save selected area as blueprint**. Saving is disabled until a non-empty area is selected; the whole board is never saved implicitly. Place blueprints by choosing one from the library and clicking an empty area of the canvas. If any target cell is occupied, placement is cancelled without changing the board.
- Campaign with logic challenges and local completion tracking.
- Circuit simulation, wires, crossings, inputs, gates, D flip-flops, undo/redo, import/export codes, zoom, pan, and keyboard shortcuts.
- Export/import a full JSON backup of BitForge's locally stored data from the landing page.

## Controls

| Action | Input |
|---|---|
| Select block | Key shown in the palette (double-click a block to rebind) |
| Place / drag-paint | Left mouse |
| Erase | Right mouse, `Z` tool, or `Delete` over a cell |
| Pan / zoom | `Space` + drag, middle-drag, arrow keys / wheel |
| Rotate | `R` (placement, or hovered gate with Pointer) |
| Pointer tool | `Q`; toggle lever, press button, cycle clock period, rotate gate, toggle nearest wire side |
| Select blueprint area | Click **Select area**, then drag a rectangle on the canvas |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Play / step | `Enter` / `.` |

## Saving and privacy

This release does not have sign-in, a backend, or cloud synchronization. Data is saved in the browser's local storage for the current site origin and browser profile. Clearing site data, using a different browser/device, or opening a different deployment domain may make existing local saves unavailable. Use **Export backup** regularly and keep the downloaded JSON file somewhere safe. Importing a backup replaces BitForge data stored in the current browser.

## Project structure

- `src/core/sim.ts` — circuit simulation engine.
- `src/core/serialize.ts` — validated world-code import/export.
- `src/core/storage.ts` — guarded local-storage helpers.
- `src/campaign/levels.ts` — campaign data.
- `src/App.tsx` — landing page, projects, blueprints, editor, and rendering.
- `src/styles.css` — editor and responsive dashboard styles.
