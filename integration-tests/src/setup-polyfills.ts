import { TextDecoder, TextEncoder } from 'util';

if (typeof global.TextEncoder === 'undefined') {
  Object.assign(global, { TextEncoder, TextDecoder });
}
