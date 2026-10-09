# Video display fonts

English names, team names, headings and numbers use Orbitron 700 / 900 from
the existing `@fontsource/orbitron` dependency (SIL Open Font License 1.1).

Large Chinese headings use ZCOOL QingKe HuangYou (站酷庆科黄油体), Regular:

- Upstream: https://github.com/google/fonts/tree/main/ofl/zcoolqingkehuangyou
- Original file: `ZCOOLQingKeHuangYou-Regular.ttf`
- Original Git blob SHA-1: `982a3b80143268592f573feb196791fbc2330e17`
- Retrieved: 2026-10-09
- Copyright: 2018 The ZCOOL QingKe HuangYou Project Authors
- License: SIL Open Font License 1.1; see `OFL-ZCOOL-QingKe-HuangYou.txt`.
- Converted to WOFF2 with fontTools for local web/video rendering. The complete
  character set is preserved. No external font requests are needed at runtime.

Orbitron is used for titles, team/player identities and short English labels.
Chinese display lettering is limited to large headings; small Chinese labels,
subtitles and longer explanatory text retain a readable body font.

The independent design study uses Barlow Condensed SemiBold for scores and
numerical data. Player names retain Orbitron.

- Upstream: https://github.com/google/fonts/tree/main/ofl/barlowcondensed
- Original file: `BarlowCondensed-SemiBold.ttf`
- Retrieved: 2026-10-09
- Copyright: 2017 The Barlow Project Authors
- License: SIL Open Font License 1.1; see `OFL-Barlow-Condensed.txt`.
- Converted to WOFF2 with fontTools without subsetting.
