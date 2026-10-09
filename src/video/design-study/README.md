# Radar design study

An independent, silent 25-second study: the 2024 LCK Spring final, game 1,
Gen.G vs T1, Chovy vs Faker. The production composition and preferences are
unchanged. This is a fixed editorial sample, not a configurable template.

Run from the project root:

```sh
npm run design:study -- --stills-only
npm run design:study
npm run design:check
```

Outputs are ignored under `output/design-study/`. With the app running, open
`http://127.0.0.1:4317/output/design-study/` for playback and comparison.
`--skip-stills` skips screenshots when only the videos need rendering.
The check command needs the app running on port 4317. It verifies decoded
video frames, synchronized playback, version switching, and responsive layouts.
The two versions use identical input data and bundled portraits. Both contain
a five-second opening and twenty-second mid-lane comparison, without music.

The new study keeps both players visible, then highlights damage per minute
and participation before holding the complete comparison. It uses the existing
pair-relative radar normalization. A fuller polygon is not an ability rating.
Deaths remain visible in K/D/A; they are not one of the existing radar axes.

Data comes from the tracked Oracle's Elixir historical fixture. The photo
selection is pinned by player ID, not current team membership. The existing
library's Chovy and Faker portraits are current photos, not 2024 match-day
photos. The on-screen credit and comparison page state this limitation.

- Chovy: [LPL official](https://lpl.qq.com/es/player_detail.shtml?mbid=2216),
  `lol-player-0f9980732ce4089c70537491.png`.
- Faker: Riot LoL Esports,
  `lol-player-ab91de7435da148b8898a170.png`.
- Image provenance: `data/fixtures/player-photos.json`.
- Font license and source: `public/assets/fonts/SOURCES.md`.

Portrait sizing is calibrated for these two images. Integrating the design
into the production template will require general portrait framing and layout
checks across all games, names, and missing-photo states.
