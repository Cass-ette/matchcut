# 验证记录

## LoL 全英雄素材（2026-10-09）

- 原目录为 14.18.1 的 168 个英雄，只有示例比赛涉及的 84 个英雄带本地图片。现同步 Riot Data Dragon 16.20.1 的全部 173 个英雄，头像与默认皮肤加载立绘共 346 张。
- `npm test` 50 项通过；`npm run build` 通过。新增全英雄图片可解码与稳定 ID 匹配检查，资料库另外验证缺图、截断图片不能发布，导出保持个人素材与偏好。
- 浏览器限制只访问本机，实际解码全部 346 张图片；素材管理返回 173 位英雄，「待补图」为 0，Akshan、Ambessa、Mel、Yunara、Zaahen、Locke 可搜索并预览两种图片。
- 新英雄使用临时页面数据验证视频预览与 Remotion 1080p 静帧，不修改用户比赛与偏好。截图在 `output/verification/lol-catalog/`。
- 资料由 `matchcut-data` v0.2.0 维护；`npm run sync:lol` 获取完整官方目录与图片，记录版本、来源和 SHA256，再导出到应用。立绘链接不区分补丁，不视作历史补丁当时的美术。

## 头像光晕裁切修复（2026-10-09）

- 图片渐隐与外层光晕分离；照片遮罩跟随实际图片高度，方形头像底部也能自然淡出。
- `npm run build` 通过。Chromium 预览与 Remotion 1080p 静帧检查覆盖 CS 定妆照、LoL 透明头像与带背景头像、LoL / Dota 英雄图，以及缺图姓名占位；高燃与收敛切换正常，文字未与图片重叠。
- 修复前后截图与六种画面的导出静帧保存在 `output/verification/glow/`。验证使用临时页面数据，没有修改用户照片绑定或偏好。

## CS 与选手照片（2026-10-09）

- `npm test`：49 项通过，覆盖 CS K/D/A 排序、换边与加时、非法/片段 Demo、流式导入与去重；选手照片按 ID 隔离、LoL 换英雄/换边/替补汇总；队标缺失与同名待确认；照片来源解析与网络地址、体积限制。
- `npm run build`：TypeScript 与生产构建通过。
- 使用 `@akiver/cs-demo-analyzer` 1.11.0 的原生解析器导入完整真实 Demo，核对 OG Esports 7:13 Monte、Anubis、20 回合、十名选手和完整 SteamID。实际源文件 SHA256：`743c3a4834433983d947a31323487a6f4aee13ce9279bc07377f90571f3697bc`。
- `MATCHCUT_CS_DEMO=… npm run smoke -- --cs --render`：真实浏览器上传 Demo、K/D/A 与手动位置切换、偏好重载、项目往返、无效文件反馈、桌面/窄屏以及完整视频导出通过。成片只有地图战报、选手雷达、击杀排行、赛果回顾四幕；十名选手使用真实本地图像。
- 成片任务：`output/2026-10-09T09-08-02-243Z-ceb23d/`。ffprobe 确认 H.264、1280×720、30 fps、无音轨。源快照、项目、字幕、封面随片保存；详细信息在 `output/verification/cs/last-job.json` 与 `metadata.json`。
- `npm run smoke -- --media --render`：独立临时素材库验证 Dota/LoL/CS 三个游戏的照片上传、预览、渲染、设置重载和项目往返；LoL/Dota 英雄/照片切换；新队标红点、待确认筛选、绑定后消失。实际 ProSettings k1to 资料页取图、预览、绑定与来源持久化通过。没有向用户素材库写入测试照片。
- 已检查 `output/verification/cs/scene-*.png` 和 `output/verification/media/` 的雷达、排行、照片、红点截图。内置 CS 十人、T1 五人照片及十张地图徽标均已下载到本地，来源清单随素材保留。
- 当前网络访问 HLTV 资料页返回 403，应用明确反馈；ProSettings 照片获取已实际验证。不保证第三方站点持续可访问。

## 先前 Dota 验证

验证日期：2026-10-09（Asia/Shanghai），横屏对位 + 黑金特效版。

- `npm run build`：TypeScript 与生产构建通过。字体从本地依赖打包。
- `npm test`：13 项测试通过，新增位置与槽位无关、五组对位、重复/缺失位置阻止导出、手动修正与跨比赛隔离、辅助指标不补零、五组字幕时序；保留原有数据与字幕检查。
- `npm run smoke -- --render`：实际 Chromium 浏览器验证通过。检查 16:9 预览尺寸、主题切换、文案编辑、使用指南、错误编号、无效参数、跨来源请求拒绝及窄屏溢出；从「一键生成视频」按钮完成 1080p 导出。
- 示例比赛 `9035078952`：Aurora Gaming vs 1win，BLAST SLAM VIII。124.73 秒，1920×1080，H.264，30 fps，黑金主题 + 高燃粒子。ffprobe 断言只有一个视频流、没有音轨。逐组覆盖一至五号位，每组 18 秒。
- `npm run test:live`：实际 OpenDota 数据验证通过。关注战队筛选返回正确队伍；无匹配战队明确报错；自动最新替换过期标题和文案、保留所选主题。
- 自动最新通过四号位 720p 静音导出验证，保留对位模式与位置选择，清除旧比赛的手动位置覆盖。实际比赛编号与属性见 `live-job.json`。
- 浏览器验证了五组/单位置/伤害模式切换、手动交换位置、位置未确定时禁用导出、恢复估计、黑金主题和两档特效。
- 从实际 1080p 视频提取 19 张画面：每组的双方聚焦和叠加雷达共 15 张，加四个其他场景。检查核心与辅助指标、角色图、强特效和文字可读性。
- 默认比赛十名英雄的高清图随项目保存。原始数据、位置来源、实际对位、项目 JSON、SRT、封面和发布文案随视频导出。

最新样片：`output/demo-positions-blackgold.mp4`；四号位对比图：`output/demo-positions-blackgold.png`。之前的横屏和竖屏样片保留。

截图与测试导出记录在 `output/verification/`：

- `last-job.json`：最终 1080p 导出任务及输入。
- `landscape-metadata.json`：实际成片的 ffprobe 信息。
- `landscape-0.png` 至 `landscape-18.png`：19 个关键画面。
- `live-job.json`：自动选择新比赛并导出 720p 的任务。
- `workspace.png` / `radar-preview.png`：桌面工作台。

输出不纳入 Git。验证仅说明上述样本和当前接口正常，不保证 OpenDota 永久可用。未解析比赛会明确失败，已缓存比赛可继续重做。
