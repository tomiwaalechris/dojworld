/* Regenerate the hotel's social previews and browser icons from its own assets. */
const sharp = require('sharp');
const fs = require('node:fs/promises');

async function main() {
  const photo = await sharp('public/dojworld/interior.png').resize(620, 630, {fit:'cover'}).png().toBuffer();
  const logo = await sharp('public/dojworld/logo.png').resize(72,72).png().toBuffer();
  const text = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="630" fill="#0b1821"/>
    <text x="48" y="95" font-family="Arial,sans-serif" font-weight="700" font-size="26" fill="white">DOJ WORLD SUITES</text>
    <text x="48" y="135" font-family="Arial,sans-serif" font-size="14" letter-spacing="3" fill="#b9cbbf">IKEJA, LAGOS</text>
    <text x="48" y="280" font-family="Arial,sans-serif" font-weight="700" font-size="62" fill="white">Stay a little.</text>
    <text x="48" y="354" font-family="Arial,sans-serif" font-weight="700" font-size="62" fill="white">Feel at home.</text>
    <rect x="48" y="400" width="52" height="3" fill="#81958b"/>
    <text x="48" y="454" font-family="Arial,sans-serif" font-size="21" fill="#e2e8ec">Discover your room. Plan your stay.</text>
    <text x="48" y="568" font-family="Arial,sans-serif" font-size="18" fill="#b9cbbf">It’s all about you.</text>
  </svg>`);
  const preview = await sharp({create:{width:1200,height:630,channels:4,background:'#0b1821'}}).composite([{input:photo,left:580,top:0},{input:text,left:0,top:0},{input:logo,left:1080,top:40}]).png().toBuffer();
  await Promise.all(['app/opengraph-image.png','app/twitter-image.png'].map(path=>fs.writeFile(path,preview)));
  await sharp('public/dojworld/logo.png').resize(180,180).ensureAlpha().png().toFile('app/apple-icon.png');
  const png = await sharp('public/dojworld/logo.png').resize(64,64).ensureAlpha().png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=64;header[7]=64;
  header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  await fs.writeFile('app/favicon.ico',Buffer.concat([header,png]));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
