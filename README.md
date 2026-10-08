# Matchcut

本机运行的 Dota 2 赛后视频工作台。内置真实比赛数据，打开后点击「一键生成视频」，输出适合电脑观看的 **16:9 横屏电竞视频**。成片无音轨、无配音、无内置配乐，可以自行添加 BGM。

画面参考 [Rock-Radar](https://github.com/TablemanLiu/Rock-Radar)：大幅六维雷达、选手名字、高清英雄图、发光轮廓与粒子。默认约 58 秒，其中雷达占 24 秒，依次聚焦双方选手，再叠加对比；其余四幕为赛果、经济走势、伤害排行和赛后定格。动画由视频帧驱动，可重复导出，不依赖录屏。

## 使用

macOS 双击 `启动 Matchcut.command`，浏览器打开 <http://127.0.0.1:4317>。应用已安装依赖；以后正常使用不需要打开代码编辑器。

第一次直接生成内置比赛即可。也可以输入比赛编号，或点击「浏览最近职业赛」。

- **指定比赛**：用已缓存数据重复渲染。可修改本场标题和逐段字幕。
- **自动最新**：每次生成寻找最新已解析的职业赛。可关注战队编号跨赛事跟进，也可用联赛编号限定当前届次。保留外观设置，为新比赛重新生成标题和字幕，避免上一场的文案混入新视频。
- 三套配色：烈焰对决、极地赛场、霓虹交锋。可改战队颜色、栏目名称、结尾、字幕、阅读节奏和清晰度。
- 外观和数据筛选偏好自动保存到 `data/preferences.json`。导出/导入项目 JSON 可以恢复某场比赛的完整文案与样式。
- 网页预览与导出共用同一套 React 视频组件。

输出位于 `output/<生成时间>-<编号>/`：

| 文件           | 用途                                                  |
| -------------- | ----------------------------------------------------- |
| `matchcut.mp4` | H.264 横屏视频，1920×1080 或 1280×720，30 fps，无音轨 |
| `cover.png`    | 对应封面                                              |
| `captions.srt` | 按阅读节奏编排的字幕                                  |
| `publish.txt`  | 标题、数据出处和文案草稿                              |
| `project.json` | 模板和文案，可在工作台重新导入                        |
| `source.json`  | 原始 OpenDota 数据及获取时间，便于核对                |
| `job.json`     | 生成状态；重启后保留历史                              |

字幕和场景文本构成静音叙事，不依赖任何文字或语音生成 API。个人设置的文案应自行核对，默认文案只描述计算得到的事实，不虚构团战过程。

## 数据来源与长期维护

数据直接来自 [OpenDota 文档](https://docs.opendota.com/)公开描述的 API，**不抓取网页 DOM，不依赖登录 Cookie，不需要 API key**。当前来源验证通过不等于第三方保证永久免费或永不变更。

- `/api/proMatches`：近期职业赛及联赛编号。列表缓存三分钟，并合并并发请求。
- `/api/matches/{id}`：完整单场数据。只有通过校验的比赛才存入本地，随后可离线重做。
- 请求串行节流，429/服务异常有限重试，超时明确反馈。一次自动查找最多检查八场已解析候选，不进行大规模轮询。
- 无完整选手字段、时间轴不一致、重复玩家、经济曲线未解析时阻止生成。不会把缺失数据当成零，也不会悄悄用示例数据冒充最新比赛。
- 解析有延迟；「最新」指近期 API 列表里可获得完整数据的最新候选，并不保证比赛刚结束即有结果。指定联赛若不在近期列表中会明确提示，可改用比赛编号。
- 联赛编号通常对应一个赛事届次。该届赛事结束后，继续追踪下一届时需要更换编号；关注战队编号可以跨赛事跟进，选择全部职业赛则不需维护这个筛选。
- 本地样例：Aurora Gaming vs 1win，BLAST SLAM VIII，比赛 `9035078952`。来源为 <https://www.opendota.com/matches/9035078952>，保留了完整快照。
- 战队及选手名称来自数据提供方；最新名称可能与比赛当时不同。英雄图片是可选装饰，下载失败时使用占位图，不影响数据生成。
- 两名聚焦选手所用英雄的高清渲染图来自 Steam CDN；首次加载后缓存。高清图不可用时保留普通英雄头像，同一进程内失败后一天内不重复请求。字体随项目安装，本地预览和导出不连接字体服务。

如果将来接口变化，修改 `server/source.ts` 和 `src/domain.ts` 的适配/校验即可，视频模板与 UI 不需要跟着改。`tests/domain.test.ts` 使用真实快照验证关键数据口径。

## 统计口径

1. 赛果来自 `radiant_win`，不根据击杀数判胜。
2. 展示比分是英雄击杀数，不是 BO3/BO5 大比分；所有输出均为单局。
3. 经济差为天辉减夜魇，时间轴使用 API 的秒级采样时间。最大领先/落后来自采样极值，不能还原每次团战。
4. 雷达分别选择两队英雄伤害最高的选手，不推断他们是同一位置。六个轴为击杀、助攻、GPM、XPM、每分钟英雄伤害、建筑伤害；每个轴按二人较高值归一化。不是综合能力分数，也不是职业选手百分位。
5. 每分钟英雄伤害 = 英雄总伤害 / 本场总分钟数。伤害排行只看英雄伤害，不含建筑伤害。
6. 源数据会随成片保存。生成日期与比赛日期分别保留。

## 开发与个性化

```sh
npm ci
npm run build
npm start
```

开发时运行 `npm run dev` 使用 Vite 热更新（先停止占用同一端口的服务）。修改代码后，运行 `npm run build` 并重启本地服务。修改默认文案后可运行 `npm run fixtures` 同步 Remotion Studio 的示例。

```sh
npm test
npm run smoke
```

`smoke` 在运行中的工作台执行浏览器检查，截图保存在 `output/verification/`。

代码入口：

- `src/video/MatchFilm.tsx`：五幕排版、动画、图表及三套色彩主题。
- `src/domain.ts`：数据口径、默认文案、阅读时长、字幕。
- `src/main.tsx` / `src/style.css`：工作台界面。
- `server/source.ts`：数据适配、缓存、限流、最新比赛选择。
- `server/render.ts`：本地渲染、封面与档案导出。
- `data/preferences.json`：本机保存的偏好。

旧版项目 JSON 可继续导入，重新生成时使用当前横屏版式；内部主题键 `paper` 对应新的「霓虹交锋」。旧版竖屏视频原文件保留，生成历史会标明「旧版竖屏」。新项目档案记录宽高、16:9 比例和模板设置。

渲染使用 Chromium。程序优先使用本机已安装的 Playwright Headless Chromium，也可用 `MATCHCUT_BROWSER=/absolute/path/to/chrome` 指定；没有可用浏览器时由 Remotion 下载。默认本地地址为 `127.0.0.1:4317`，不向局域网开放。若使用 `PORT` 更换端口，双击启动脚本中的地址也应同步修改。

## 参考与素材

- [Rock-Radar / TablemanLiu](https://github.com/TablemanLiu/Rock-Radar)（MIT）：雷达主视觉、选手聚焦和动效风格参考。Matchcut 的排版与帧动画独立实现。
- Orbitron 字体：SIL Open Font License 1.1，许可保留在 `public/assets/Orbitron-OFL.txt`，通过 `@fontsource/orbitron` 本地打包。

- [Remotion Showcase](https://www.remotion.dev/showcase)：参数化视频、模板复用的产品案例入口。
- [Remotion Player](https://www.remotion.dev/docs/player/player)：网页内实时预览。
- [Remotion renderMedia](https://www.remotion.dev/docs/renderer/render-media)：程序化导出。
- [Remotion 许可](https://www.remotion.dev/docs/license/pricing)：目前符合条件的个人及不超过三人的公司可使用免费许可；扩大团队时重新核对许可。
- OpenDota 提供比赛统计。Dota 2 英雄图片由 Steam CDN 提供，角色、美术与游戏商标属于 Valve；本项目没有赛事转播镜头或第三方音乐。

本版本没有自动发布功能。最终是否发布及账号运营由使用者决定。
