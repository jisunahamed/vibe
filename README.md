# Strange Attractor 3D Web App

An interactive 3D strange attractor visualizer built with Next.js, Three.js, and MediaPipe Hand Tracking.

## Features
- **Fullscreen 3D Visuals**: Render high-point-count attractors using WebGL (Three.js).
- **Hand Tracking**: Cycle attractors by making a fist in front of your webcam.
- **Interactivity**: Drag to orbit the camera, Space/Click to cycle manually.
- **5 Attractors**: Lorenz, Aizawa, Thomas, Halvorsen, and Arneodo.
- **Performance**: Optimized physics (RK4) and point rendering (Float32Array + Additive Blending).

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Graphics**: Three.js (Raw)
- **AI/CV**: @mediapipe/tasks-vision

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Download MediaPipe Model
The app requires the `hand_landmarker.task` file in the `public/models` directory.
```bash
node scripts/download-model.mjs
```

### 3. Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Vercel
1. Push your code to a GitHub repository.
2. Import the project into Vercel.
3. Vercel will automatically detect Next.js and deploy.
4. **Note**: Camera permissions require an HTTPS connection. Vercel provides this by default.

## Troubleshooting

- **Camera Permission**: Ensure you grant camera access when prompted.
- **HTTPS**: Webcam tracking only works over HTTPS (or localhost).
- **Model Path**: If you see "Initializing..." indefinitely, check if `public/models/hand_landmarker.task` exists.
- **Performance**: Cap on DPR (Device Pixel Ratio) is set to 2 to ensure smooth performance on high-res displays.

## Credits
Inspired by the attractors-eight demo.
Built with Three.js and MediaPipe.
