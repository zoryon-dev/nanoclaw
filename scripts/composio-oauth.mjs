#!/usr/bin/env node
/**
 * Composio MCP OAuth 2.1 PKCE flow — two-step version
 * Step 1 (no args): register client, generate PKCE, print auth URL, save state
 * Step 2 (--code <code>): exchange code for token, save credentials
 */
import crypto from 'crypto';
import fs from 'fs';
import { URL } from 'url';

const STATE_PATH = '/tmp/composio-oauth-state.json';
const CREDENTIALS_PATH = '/root/nanoclaw/data/sessions/whatsapp_main/.claude/.credentials.json';
const AUTH_SERVER = 'https://connect.composio.dev/api/v3/auth/dash';
const RESOURCE = 'https://connect.composio.dev/mcp';
const REDIRECT_URI = 'http://127.0.0.1:9876/callback';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return JSON.parse(text);
}

async function step1() {
  console.log('=== Step 1: Gerar URL de autenticação ===\n');

  // Register dynamic client
  const regData = await fetchJson(`${AUTH_SERVER}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'NanoClaw Agent',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  // Generate PKCE
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());

  // Save state
  fs.writeFileSync(STATE_PATH, JSON.stringify({ clientId: regData.client_id, codeVerifier }));

  // Build auth URL
  const authUrl = new URL(`${AUTH_SERVER}/oauth2/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', regData.client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('scope', 'openid profile email offline_access');

  console.log('Abra esta URL no navegador:\n');
  console.log(authUrl.toString());
  console.log('\nDepois cole a URL de redirect aqui e rode:');
  console.log('  node scripts/composio-oauth.mjs --code <CODE>\n');
}

async function step2(code) {
  console.log('=== Step 2: Trocar código por token ===\n');

  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));

  const tokenData = await fetchJson(`${AUTH_SERVER}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: state.clientId,
      code_verifier: state.codeVerifier,
    }).toString(),
  });

  console.log('Token obtido!\n');

  // Save to credentials
  const credentials = fs.existsSync(CREDENTIALS_PATH)
    ? JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'))
    : { mcpOAuth: {} };

  const mcpOAuth = credentials.mcpOAuth || {};
  const composioKey = Object.keys(mcpOAuth).find(k => k.startsWith('composio|'))
    || `composio|${crypto.randomBytes(8).toString('hex')}`;

  mcpOAuth[composioKey] = {
    serverName: 'composio',
    serverUrl: RESOURCE,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || '',
    expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : 0,
    discoveryState: {
      authorizationServerUrl: AUTH_SERVER,
      resourceMetadataUrl: 'https://connect.composio.dev/.well-known/oauth-protected-resource',
    },
    clientId: state.clientId,
    codeVerifier: state.codeVerifier,
  };

  credentials.mcpOAuth = mcpOAuth;
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
  console.log(`Credenciais salvas em:\n  ${CREDENTIALS_PATH}\n`);

  // Cleanup
  fs.unlinkSync(STATE_PATH);
  console.log('=== Composio OAuth concluído! ===');
}

// Parse args
const codeIdx = process.argv.indexOf('--code');
if (codeIdx !== -1 && process.argv[codeIdx + 1]) {
  step2(process.argv[codeIdx + 1]).catch(e => { console.error('Erro:', e.message); process.exit(1); });
} else {
  step1().catch(e => { console.error('Erro:', e.message); process.exit(1); });
}
