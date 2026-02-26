import https from 'https';
import fs from 'fs';
import path from 'path';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const OUTPUT_DIR = 'public/models';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'hand_landmarker.task');

async function downloadModel() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Downloading model from ${MODEL_URL}...`);
  
  const file = fs.createWriteStream(OUTPUT_FILE);
  
  https.get(MODEL_URL, (response) => {
    if (response.statusCode !== 200) {
      console.error(`Failed to download model: ${response.statusCode} ${response.statusMessage}`);
      process.exit(1);
    }
    
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log('Model downloaded successfully to', OUTPUT_FILE);
    });
  }).on('error', (err) => {
    fs.unlink(OUTPUT_FILE, () => {});
    console.error('Error downloading model:', err.message);
    process.exit(1);
  });
}

downloadModel();
