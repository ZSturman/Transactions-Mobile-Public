// Vector source is canonical; PNGs are generated for native packaging.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("../../web/node_modules/sharp");
const assets = path.resolve(__dirname, "../assets");
(async () => {
  const source = fs.readFileSync(
    path.join(assets, "transactions-mark.svg"),
    "utf8",
  );
  await sharp(Buffer.from(source)).png().toFile(path.join(assets, "icon.png"));
  const transparent = source.replace(
    '<rect width="1024" height="1024" fill="#2563EB"/>',
    "",
  );
  await sharp(Buffer.from(transparent))
    .png()
    .toFile(path.join(assets, "android-icon-foreground.png"));
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: "#2563EB" },
  })
    .png()
    .toFile(path.join(assets, "android-icon-background.png"));
  await sharp(Buffer.from(transparent))
    .png()
    .toFile(path.join(assets, "android-icon-monochrome.png"));
  await sharp(Buffer.from(source))
    .resize(256, 256)
    .png()
    .toFile(path.join(assets, "splash-icon.png"));
  await sharp(Buffer.from(source))
    .resize(48, 48)
    .png()
    .toFile(path.join(assets, "favicon.png"));
  console.log("Transactions native icons rendered from transactions-mark.svg");
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
