declare module 'jsonwebtoken' {
  import type { SignOptions } from 'jsonwebtoken';
  export function sign(payload: string | object | Buffer, secretOrPrivateKey: string, options?: SignOptions): string;
}
