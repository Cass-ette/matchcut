# LoL Final Inventory Fixtures

Retrieved from Games of Legends on 2026-10-10. HTML contains the relevant
server-rendered game sections only; site scripts, advertising and search indexes
are omitted. Player records were checked against the imported Oracle's Elixir
CSV for sides, roles, names, champions, final KDA, CS, patch and duration.

- G1, paused: https://gol.gg/game/stats/83540/page-game/
- G2, normal finish: https://gol.gg/game/stats/83541/page-game/
- Series: https://gol.gg/game/stats/83540/page-summary/
- Match list: https://gol.gg/tournament/tournament-matchlist/Demacia%20Cup%20Global%20Invitational%202026/
- Tournament index: POST https://gol.gg/tournament/ajax.trlist.php, season=S16

Item images describe occupied inventory slots, not consumable stack counts.
Role quest markers in the raw pages are intentionally retained for filter tests.
