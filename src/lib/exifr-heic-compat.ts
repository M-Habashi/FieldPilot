const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const maximumFtypLength = 4_096;

interface ExifrBufferView {
  byteLength: number;
  getString(offset: number, length: number): string;
  getUint32(offset: number): number;
}

interface ExifrFileParser {
  canHandle(file: ExifrBufferView, firstTwoBytes: number): boolean;
}

interface ExifrRuntime {
  fileParsers: { get(name: string): unknown };
}

const patchedParsers = new WeakSet<object>();

/**
 * exifr 7.1.3 rejects otherwise valid HEIC files when their `ftyp` box is
 * larger than 50 bytes. Modern iPhones can emit a 52-byte box with additional
 * compatible brands. Validate the complete box instead of relying on that
 * arbitrary size ceiling, then let exifr's unchanged HEIC/EXIF parser inspect
 * the original bytes.
 */
function hasRecognizedHeicBrand(file: ExifrBufferView, firstTwoBytes: number): boolean {
  if (firstTwoBytes !== 0 || file.byteLength < 16 || file.getString(4, 4) !== 'ftyp') {
    return false;
  }

  const ftypLength = file.getUint32(0);
  if (
    !Number.isSafeInteger(ftypLength) ||
    ftypLength < 16 ||
    ftypLength > maximumFtypLength ||
    ftypLength > file.byteLength ||
    (ftypLength - 16) % 4 !== 0
  ) {
    return false;
  }

  if (heicBrands.has(file.getString(8, 4))) return true;
  for (let offset = 16; offset + 4 <= ftypLength; offset += 4) {
    if (heicBrands.has(file.getString(offset, 4))) return true;
  }
  return false;
}

export function enableExtendedHeicRecognition(runtime: ExifrRuntime): boolean {
  const candidate = runtime.fileParsers.get('heic');
  if (
    (typeof candidate !== 'function' && typeof candidate !== 'object') ||
    candidate === null ||
    !('canHandle' in candidate) ||
    typeof candidate.canHandle !== 'function'
  ) {
    return false;
  }

  const parser = candidate as ExifrFileParser;
  if (patchedParsers.has(candidate)) return true;
  const originalCanHandle = parser.canHandle;
  parser.canHandle = (file, firstTwoBytes) =>
    originalCanHandle.call(parser, file, firstTwoBytes) ||
    hasRecognizedHeicBrand(file, firstTwoBytes);
  patchedParsers.add(candidate);
  return true;
}
