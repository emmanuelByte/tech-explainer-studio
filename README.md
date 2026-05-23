# MotionEditor

MotionEditor is a local, browser-based motion design editor for creating short animated videos, social media clips, UI mockups, text animations, and simple composition layouts. It is built with React, Vite, Zustand, Tailwind CSS, Lucide icons, and Remotion.

The goal is to make animation editing feel direct and easy: create a project, add layers, move things on the canvas, edit timing in the timeline, add keyframes, apply easing, and export or back up your work.

## What It Can Do

- Manage multiple projects from a home screen with search, sorting, grid/list views, thumbnails, import, export, duplicate, rename, and delete.
- Create projects with common canvas presets for YouTube, Instagram, TikTok, and custom sizes.
- Edit a canvas with rectangles, ellipses, lines, triangles, custom paths, text, raster images, SVG images, and Lucide icons.
- Organize layers with nested groups, drag-and-drop parenting, multi-selection, locking, visibility, and layer ordering.
- Animate layers with keyframes, per-property animation tracks, timeline resizing, easing controls, value graph support, and direct keyframe editing.
- Build text animations such as typewriter, character pop, fall, rise, spin, blur, word reveal, and line reveal.
- Build custom 3D motion by entering your own rotation, skew, scale, opacity, and perspective values.
- Style layers with fills, gradients, strokes, SVG stroke/fill controls, image fit options, shadows, blur, brightness, contrast, grayscale, and backdrop blur.
- Use light or dark mode and switch the interface language between English and Czech.
- Auto-save projects and keep manual version history snapshots.
- Store projects as readable JSON files on your local machine.

## Why It Is Easy To Use

MotionEditor is designed around familiar editor concepts:

- The home screen shows every project clearly, with previews.
- The center canvas is for direct manipulation.
- The left panel is for layer structure.
- The bottom timeline is for timing and animation.
- The right panel is for design, style, effects, and motion.
- Most important controls are visual and grouped by intent instead of hidden in menus.

You can start with a blank project, add a shape or text layer, drag it around, open the Motion tab, and create an animation without writing code.

## Tech Stack

- React 19
- Vite 8
- Zustand
- Remotion and Remotion Player
- Tailwind CSS
- Lucide React icons
- i18next and react-i18next
- Local Vite middleware for JSON project storage and optional AI assistance

## Requirements

- Node.js
- npm

## Run Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The app is local-first. Projects are saved by the dev server into:

```text
data/projects
```

Each project is a JSON file, and version history is stored next to it as a history JSON file.

## Build

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Exporting Video

The editor includes an Export MP4 dialog that gives you a Remotion render command for the current composition. The command is based on the current project dimensions and frame range.

Example:

```bash
npx remotion render src/remotion/index.ts EditorComposition out/video.mp4
```

## Optional AI Assistant

The editor includes optional AI help. The top bar AI button opens a full-height ChatKit panel on the right side, so you can keep chatting without covering the canvas. The older local AI endpoint is still available for editor actions and prompt experiments.

To enable it, copy the example config:

```bash
cp ai.config.example.json ai.config.local.json
```

Then add your model and API key:

```json
{
  "model": "gpt-4.1-mini",
  "apiKey": "sk-...",
  "chatkitWorkflowId": "wf_..."
}
```

Restart the dev server after changing the config.

`ai.config.local.json` is ignored by Git so the API key is not committed or bundled into the browser. The browser calls the local `/api/chatkit/session` endpoint, and the Vite dev server creates a short-lived ChatKit session token using your OpenAI key and `chatkitWorkflowId`. You can also set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_CHATKIT_WORKFLOW_ID` as environment variables.

## Project Storage

Projects are saved as JSON through local API endpoints implemented in `server/projectStoragePlugin.ts`.

Stored data includes:

- Project name, id, created/updated dates, and thumbnail
- Canvas size, fps, duration, and background
- Full layer tree
- Text styling and image data
- Keyframes and easing
- Timeline state
- Editor viewport state
- Manual history snapshots

The home screen also supports importing and exporting `.motionproj` files and backing up all projects as JSON.

## Internationalization

Translations live in:

```text
src/i18n.ts
```

Supported languages:

- English
- Czech

Use the settings button in the app to switch language and theme.

## Useful Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Notes

This is a local editor, not a hosted collaborative platform. It is meant to be simple to run, easy to understand, and practical for building motion compositions without setting up a database or cloud backend.

For a production deployment, move the project storage and AI endpoints to a real backend so file access, authentication, rate limits, and API keys are handled safely.
