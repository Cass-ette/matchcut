import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchPhotoCandidate,
  parsePhotoPage,
  photoPageUrl,
  photoImageUrl,
  limitedFetch,
} from "../server/player-photos";

test("photo profiles resolve the player's own image rather than article covers or author avatars", async () => {
  const pageUrl = "https://prosettings.net/players/woro2k/";
  const imageUrl = "https://prosettings.net/wp-content/uploads/woro2k.webp";
  const html = `<meta property="og:image" content="wrong-cover.png"><script type="application/ld+json">${JSON.stringify(
    {
      "@graph": [
        {
          "@type": "Person",
          url: pageUrl,
          additionalName: "Woro2k",
          image: { "@id": "image-1" },
        },
        {
          "@type": "Person",
          url: "https://prosettings.net/members/author/",
          image: { "@id": "author" },
        },
        { "@type": "ImageObject", "@id": "image-1", contentUrl: imageUrl },
      ],
    },
  )}</script>`;
  const candidate = await fetchPhotoCandidate(
    pageUrl,
    async () => new Response(html),
  );
  assert.deepEqual(candidate, {
    name: "Woro2k",
    provider: "ProSettings",
    pageUrl,
    imageUrl,
  });
  const hltv = parsePhotoPage(
    '<h1 class="playerNickname">Woro2k</h1><img class="bodyshot-img" src="https://img-cdn.hltv.org/playerbodyshot/example.png?x=1&amp;y=2">',
    photoPageUrl("https://www.hltv.org/player/16885/woro2k"),
  );
  assert.equal(
    hltv.imageUrl,
    "https://img-cdn.hltv.org/playerbodyshot/example.png?x=1&y=2",
  );
  assert.throws(
    () => parsePhotoPage("<html>No photo</html>", new URL(pageUrl)),
    /没有可用/,
  );
});

test("remote photos restrict hosts and size and report blocked HLTV pages explicitly", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "https://prosettings.net.evil.org/players/faker/",
    "https://user:pass@prosettings.net/players/faker/",
    "https://prosettings.net:444/players/faker/",
    "https://prosettings.net/other/",
  ])
    assert.throws(() => photoPageUrl(url));
  assert.throws(() => photoImageUrl("https://127.0.0.1/photo.png"));
  assert.throws(() => photoImageUrl("https://prosettings.net/admin/test"));
  await assert.rejects(
    fetchPhotoCandidate(
      "https://www.hltv.org/player/16885/woro2k",
      async () => new Response("blocked", { status: 403 }),
    ),
    /HLTV 暂时拒绝/,
  );
  await assert.rejects(
    limitedFetch(
      new URL("https://prosettings.net/wp-content/uploads/image.png"),
      3,
      async () => new Response("12345"),
    ),
    /过大/,
  );
});
