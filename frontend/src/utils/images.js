// Shrinks a photo in the browser before it is sent with a ticket.
//
// The backend reads JSON bodies with body-parser's default 100 KB limit, so the
// photo travels as a small JPEG data URL (aim: under ~80 KB) inside the ticket JSON.
// That keeps ticket creation a single request with no upload endpoint needed.

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // refuse anything absurd before decoding it
const TARGET_CHARS = 80 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

export async function compressImage(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Photos must be PNG, JPEG, GIF or WebP.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That photo is over 10 MB. Please choose a smaller one.');
  }

  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Step down size and quality until it fits
  for (const maxSide of [960, 720, 560, 420]) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.fillStyle = '#ffffff'; // transparent PNGs would turn black as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.72, 0.6, 0.48]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= TARGET_CHARS) return dataUrl;
    }
  }
  throw new Error('That photo is too detailed to attach. Try a cropped or smaller photo.');
}
