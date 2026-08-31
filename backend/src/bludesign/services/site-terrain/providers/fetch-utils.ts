import { SiteTerrainError, SiteTerrainErrorCode } from '../types';

export async function fetchTileBuffer(
  url: string,
  label: string
): Promise<{ data: Buffer; contentType: string }> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new SiteTerrainError(
      `Failed to fetch ${label} tile: ${url}`,
      SiteTerrainErrorCode.FETCH_FAILED,
      err
    );
  }

  if (!response.ok) {
    throw new SiteTerrainError(
      `${label} tile fetch returned ${response.status}: ${url}`,
      SiteTerrainErrorCode.FETCH_FAILED
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  return { data, contentType };
}

export function buildTileFetchResult(
  data: Buffer,
  contentType: string,
  tile: { z: number; x: number; y: number }
) {
  return {
    data,
    contentType,
    tile,
    byteLength: data.length,
  };
}
