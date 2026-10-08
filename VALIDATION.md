# 验证记录

验证日期：2026-10-09（Asia/Shanghai），横屏电竞版。

- `npm run build`：TypeScript 与生产构建通过。字体从本地依赖打包。
- `npm test`：8 项数据与字幕测试通过，覆盖真实源快照、胜负口径、缺失值与零值、时间轴、重复选手、雷达归一化、字幕时序、数字完整性，以及横屏雷达说明不会被拆成半句话。
- `npm run smoke -- --render`：实际 Chromium 浏览器验证通过。检查 16:9 预览尺寸、主题切换、文案编辑、使用指南、错误编号、无效参数、跨来源请求拒绝及窄屏溢出；从「一键生成视频」按钮完成 1080p 导出。
- 示例比赛 `9035078952`：Aurora Gaming vs 1win，BLAST SLAM VIII。约 58 秒，1920×1080，H.264，30 fps。ffprobe 断言只有一个视频流、没有音轨。
- `npm run test:live`：实际 OpenDota 数据验证通过。关注战队筛选返回正确队伍；无匹配战队明确报错；自动最新替换过期标题和文案、保留所选主题。
- 自动选择比赛 `9035318247`：LEGION vs Blasterbl，58 秒，1280×720；ffprobe 断言只有一个视频流、没有音轨。
- 从实际 1080p 视频提取了七张画面：赛果、经济走势、skiter 聚焦、Pure 聚焦、双人雷达、伤害排行、赛后定格。检查了角色图、图表数据、数值标签和文字遮挡。
- 高清英雄图在首次加载后缓存；默认比赛的两张高清图随项目保存。原始数据、项目 JSON、SRT、封面和发布文案随视频导出。

默认样片：`output/demo-landscape.mp4`；封面：`output/demo-landscape-cover.png`。旧版竖屏样片保留。

截图与测试导出记录在 `output/verification/`：

- `last-job.json`：最终 1080p 导出任务及输入。
- `landscape-metadata.json`：实际成片的 ffprobe 信息。
- `landscape-0.png` 至 `landscape-6.png`：七个关键画面。
- `live-job.json`：自动选择新比赛并导出 720p 的任务。
- `workspace.png` / `radar-preview.png`：桌面工作台。

输出不纳入 Git。验证仅说明上述样本和当前接口正常，不保证 OpenDota 永久可用。未解析比赛会明确失败，已缓存比赛可继续重做。
