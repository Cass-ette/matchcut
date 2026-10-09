import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowLeft,
  Columns2,
  Download,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";

const icon = (component: typeof Play) =>
  renderToStaticMarkup(
    createElement(component, { size: 18, "aria-hidden": true }),
  );

export const designStudyPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chovy / Faker · Matchcut 样片</title>
  <style>
    *{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#151617;color:#f1f0ec;font:14px Arial,"PingFang SC",sans-serif;letter-spacing:0}button,a,input{font:inherit}button,a{color:inherit}a{text-decoration:none}button{cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid #d7bd78;outline-offset:4px}
    main{max-width:1680px;margin:auto;padding:32px 40px 28px}header{display:flex;justify-content:space-between;gap:24px;align-items:center;padding-bottom:24px;border-bottom:1px solid #383a3b}.brand{display:flex;gap:16px;align-items:center}.brand a,.icon{display:inline-flex;justify-content:center;align-items:center;width:40px;height:40px;border:1px solid #424445;border-radius:4px;background:transparent;flex-shrink:0}.brand a:hover,.icon:hover{background:#292b2c}h1{font-size:24px;font-weight:600;margin:0 0 8px}p{margin:0;color:#a4a6a8;line-height:1.6}.duration{font-variant-numeric:tabular-nums;color:#a4a6a8;white-space:nowrap}
    .toolbar{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:22px 0}.tabs{display:flex;gap:4px;background:#222425;padding:4px;border-radius:5px}.tabs button{display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:3px;padding:9px 19px;background:transparent;color:#a4a6a8;min-height:38px;white-space:nowrap}.tabs button[aria-pressed=true]{background:#eeefeb;color:#191a1b}.actions{display:flex;gap:8px}.primary{display:flex;gap:8px;align-items:center;justify-content:center;padding:0 17px;height:40px;background:#d7bd78;color:#171819;border:0;border-radius:4px;white-space:nowrap}
    .films{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;max-width:1280px;margin:auto}.films.pair{grid-template-columns:repeat(2,minmax(0,1fr));max-width:none}figure{margin:0;min-width:0}figure[hidden]{display:none}video{display:block;width:100%;aspect-ratio:16/9;background:#0d0e0f;border:1px solid #383a3b}figcaption{display:flex;justify-content:space-between;align-items:center;padding:15px 0;gap:16px;font-size:14px;color:#a4a6a8}figcaption strong{color:#f1f0ec;font-weight:500}.download{display:flex;align-items:center;gap:7px}.download:hover{color:#d7bd78}.foot{border-top:1px solid #383a3b;padding-top:20px;margin-top:14px;font-size:12px;color:#858789;display:flex;justify-content:space-between;gap:12px}#error{color:#ef6574;margin-top:12px}
    @media(max-width:700px){main{padding:22px 16px}header{gap:12px}.brand{gap:12px}h1{font-size:20px}.duration{display:none}.toolbar{flex-wrap:wrap;gap:12px;padding:18px 0}.tabs button{padding:8px 13px}.films.pair{grid-template-columns:minmax(0,1fr);gap:18px}.foot{flex-direction:column}.primary{padding:0 12px}figcaption{font-size:13px}}
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand"><a href="/?game=lol" title="返回工作台" aria-label="返回工作台">${icon(ArrowLeft)}</a><div><h1>Chovy / Faker</h1><p>Gen.G vs T1 · 2024 LCK 春季赛决赛 G1</p></div></div>
      <span class="duration">25 秒 · 1080p · 无声样片</span>
    </header>
    <div class="toolbar">
      <div class="tabs" role="group" aria-label="对比视图">
        <button data-mode="new" aria-pressed="true">新版</button><button data-mode="current" aria-pressed="false">现版</button><button data-mode="pair" aria-pressed="false">${icon(Columns2)} 并排</button>
      </div>
      <div class="actions"><button class="icon" id="replay" title="从头播放" aria-label="从头播放">${icon(RotateCcw)}</button><button class="primary" id="play"><span data-play-icon style="display:flex">${icon(Play)}</span><span data-play-label>播放</span></button></div>
    </div>
    <div class="films" id="films">
      <figure id="new-figure"><video id="new-video" controls playsinline preload="metadata" poster="new-compare.png" src="new.mp4" aria-label="新版样片"></video><figcaption><strong>新版 / 双人对位</strong><a class="download" href="new.mp4" download>${icon(Download)}下载</a></figcaption></figure>
      <figure id="current-figure" hidden><video id="current-video" controls playsinline preload="metadata" poster="current-compare.png" src="current.mp4" aria-label="现版样片"></video><figcaption><strong>现版 / 当前模板</strong><a class="download" href="current.mp4" download>${icon(Download)}下载</a></figcaption></figure>
    </div>
    <p id="error" role="status"></p>
    <div class="foot"><span>同一场比赛 · 同一组中路选手 · 开场 + 完整对位</span><span>数据：Oracle's Elixir · 定妆照使用现有资料图</span></div>
  </main>
  <script>
    const videos = [...document.querySelectorAll('video')];
    const figures = [...document.querySelectorAll('figure')];
    const tabs = [...document.querySelectorAll('[data-mode]')];
    const play = document.getElementById('play');
    const error = document.getElementById('error');
    let mode = 'new';
    let syncing = false;
    let playbackRequest = 0;
    const active = () => mode === 'pair' ? videos : [videos[mode === 'new' ? 0 : 1]];
    const icons = { play: ${JSON.stringify(icon(Play))}, pause: ${JSON.stringify(icon(Pause))} };
    const label = () => {
      const playing = active().some(v => !v.paused);
      play.querySelector('[data-play-label]').textContent = playing ? '暂停' : '播放';
      play.querySelector('[data-play-icon]').innerHTML = playing ? icons.pause : icons.play;
    };
    async function start() {
      const request = ++playbackRequest;
      const targets = active();
      try { await Promise.all(targets.map(v => v.play())); if (request === playbackRequest) error.textContent = ''; }
      catch (failure) {
        if (request !== playbackRequest || failure.name === 'AbortError') return;
        targets.forEach(v => v.pause()); error.textContent = '播放失败，请重新播放。';
      }
      label();
    }
    function seek(video, time) {
      if (video.readyState >= 1) video.currentTime = time;
      else video.addEventListener('loadedmetadata', () => { video.currentTime = time; }, { once: true });
    }
    tabs.forEach(tab => tab.addEventListener('click', () => {
      const previous = active()[0];
      const time = previous.currentTime;
      const playing = !previous.paused;
      playbackRequest++;
      mode = tab.dataset.mode;
      syncing = true;
      videos.forEach(v => v.pause());
      active().forEach(v => seek(v, time));
      figures[0].hidden = mode === 'current';
      figures[1].hidden = mode === 'new';
      document.getElementById('films').classList.toggle('pair', mode === 'pair');
      tabs.forEach(t => t.setAttribute('aria-pressed', String(t === tab)));
      syncing = false;
      if (playing) void start();
      label();
    }));
    play.addEventListener('click', () => {
      if (active().some(v => !v.paused)) { playbackRequest++; active().forEach(v => v.pause()); }
      else { if (active()[0].ended) active().forEach(v => seek(v, 0)); void start(); }
      label();
    });
    document.getElementById('replay').addEventListener('click', () => { active().forEach(v => seek(v, 0)); void start(); });
    videos.forEach(video => {
      video.addEventListener('error', () => { error.textContent = '视频未加载完成，请确认样片已渲染。'; });
      ['play', 'pause', 'seeking'].forEach(event => video.addEventListener(event, () => {
        label();
        if (mode !== 'pair' || syncing) return;
        syncing = true;
        const other = videos.find(v => v !== video);
        if (event === 'seeking' && Math.abs(other.currentTime - video.currentTime) > 0.08) seek(other, video.currentTime);
        if (event === 'play' && !video.paused && other.paused) void other.play().catch(failure => { if (failure.name !== 'AbortError') error.textContent = '另一版未能同步播放。'; });
        if (event === 'pause' && video.paused && !other.paused) other.pause();
        syncing = false;
      }));
    });
  </script>
</body>
</html>`;
