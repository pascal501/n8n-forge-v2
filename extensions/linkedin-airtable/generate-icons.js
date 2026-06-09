// Script Node.js pour générer les icônes PNG (à lancer une seule fois)
// Requiert : npm install canvas
// Usage : node generate-icons.js

const { createCanvas } = require("canvas");
const fs = require("fs");

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Fond bleu LinkedIn
  ctx.fillStyle = "#0a66c2";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.18);
  ctx.fill();

  // Lettre "in" blanche
  ctx.fillStyle = "white";
  ctx.font = `bold ${Math.floor(size * 0.55)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("in", size / 2, size / 2);

  return canvas.toBuffer("image/png");
}

for (const size of [16, 48, 128]) {
  fs.writeFileSync(`icons/icon${size}.png`, createIcon(size));
  console.log(`✓ icons/icon${size}.png`);
}
