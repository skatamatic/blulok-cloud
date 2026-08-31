import { computeScaledThumbnailDimensions } from '../../../../components/bludesign/core/viewport/captureSceneThumbnail';

describe('captureSceneThumbnail', () => {
  describe('computeScaledThumbnailDimensions', () => {
    it('uses maxSize as width when source is landscape', () => {
      expect(computeScaledThumbnailDimensions(800, 400, 256)).toEqual({
        width: 256,
        height: 128,
      });
    });

    it('uses maxSize as height when source is portrait', () => {
      expect(computeScaledThumbnailDimensions(400, 800, 256)).toEqual({
        width: 128,
        height: 256,
      });
    });

    it('handles square source', () => {
      expect(computeScaledThumbnailDimensions(512, 512, 256)).toEqual({
        width: 256,
        height: 256,
      });
    });
  });
});
