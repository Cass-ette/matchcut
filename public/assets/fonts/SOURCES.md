# Video display fonts

All English video text and numbers use Orbitron 700 / 900 from
the existing `@fontsource/orbitron` dependency (SIL Open Font License 1.1).

Chinese video lettering uses ZCOOL QingKe HuangYou (站酷庆科黄油体), Regular:

- Upstream: https://github.com/google/fonts/tree/main/ofl/zcoolqingkehuangyou
- Original file: `ZCOOLQingKeHuangYou-Regular.ttf`
- Original Git blob SHA-1: `982a3b80143268592f573feb196791fbc2330e17`
- Retrieved: 2026-10-09
- Copyright: 2018 The ZCOOL QingKe HuangYou Project Authors
- License: SIL Open Font License 1.1; see `OFL-ZCOOL-QingKe-HuangYou.txt`.
- Converted to WOFF2 with fontTools for local web/video rendering. The complete
  character set is preserved. No external font requests are needed at runtime.

The production film uses one font stack throughout: Orbitron, then ZCOOL QingKe
HuangYou. This includes the game name, tournament header, dates, chart axes,
tables and subtitles as well as player identities and titles. Chinese characters
fall back to the bundled Chinese face. The editor's interface retains its own
body font.

The independent design study uses Barlow Condensed SemiBold for scores and
numerical data. Player names retain Orbitron.

- Upstream: https://github.com/google/fonts/tree/main/ofl/barlowcondensed
- Original file: `BarlowCondensed-SemiBold.ttf`
- Retrieved: 2026-10-09
- Copyright: 2017 The Barlow Project Authors
- License: SIL Open Font License 1.1; see `OFL-Barlow-Condensed.txt`.
- Converted to WOFF2 with fontTools without subsetting.
