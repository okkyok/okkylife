const fs = require('fs');
const { createCanvas } = require('canvas');

// Create a 1200x630 canvas (common social media image size)
const width = 1200;
const height = 630;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Create gradient background
const gradient = ctx.createLinearGradient(0, 0, width, height);
gradient.addColorStop(0, '#f0f0f0');
gradient.addColorStop(1, '#d0d0d0');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, width, height);

// Add text
ctx.fillStyle = '#555555';
ctx.font = 'bold 48px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('Image Unavailable', width / 2, height / 2);

// Save to file
const buffer = canvas.toBuffer('image/jpeg');
fs.writeFileSync('./public/images/fallback-image.jpg', buffer);

console.log('Fallback image created at public/images/fallback-image.jpg');
