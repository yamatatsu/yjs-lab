export const valueEncoding = {
  encode: (buf: Uint8Array) => Buffer.from(buf),
  decode: (buf: Iterable<number>) => Uint8Array.from(buf),
};
