import { Request, Response } from 'express';
import { config } from '../config/env';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

const secureCookie = () => config.COOKIE_SECURE ?? config.NODE_ENV === 'production';

export function setRefreshCookie(res: Response, token: string, remember = true) {
  const attributes = [
    `${config.COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/api/v1/auth',
    'HttpOnly',
    `SameSite=${secureCookie() ? 'Strict' : 'Lax'}`,
    ...(secureCookie() ? ['Secure'] : []),
    ...(remember ? [`Max-Age=${30 * 24 * 60 * 60}`] : [])
  ];
  res.append('Set-Cookie', attributes.join('; '));
}

export function clearRefreshCookie(res: Response) {
  res.append(
    'Set-Cookie',
    `${config.COOKIE_NAME}=; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie() ? '; Secure' : ''}`
  );
}

export function setOAuthStateCookie(res: Response, state: string) {
  res.append(
    'Set-Cookie',
    `finance_oauth_state=${encodeURIComponent(state)}; Path=/api/v1/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=600${secureCookie() ? '; Secure' : ''}`
  );
}

export function clearOAuthStateCookie(res: Response) {
  res.append(
    'Set-Cookie',
    `finance_oauth_state=; Path=/api/v1/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie() ? '; Secure' : ''}`
  );
}
