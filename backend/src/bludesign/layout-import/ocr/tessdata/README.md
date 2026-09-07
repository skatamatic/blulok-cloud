# Vendored Tesseract English LSTM traineddata (gzip).

This directory must contain `eng.traineddata.gz` (~2.8 MiB). The layout-import OCR
worker loads it from disk at runtime (`ocrLabels.ts` → `VENDORED_TESSDATA_DIR`) with
`cacheMethod: 'none'` so CI and Docker never fetch language data over the network.

Production builds copy this file into `dist/` via `scripts/copy-build-assets.js`
(see `npm run build`). `Dockerfile.prod` asserts the file exists after build.
