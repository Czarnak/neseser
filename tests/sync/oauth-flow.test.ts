import { describe, expect, test } from 'vitest';
import { runOAuthFlow } from '../../src/sync/oauth-flow';
import type { HttpClient } from '../../src/sync/ticktick-client';

function tokenHttp(bodies: string[] = []): HttpClient {
	return async (req) => {
		bodies.push(req.body ?? '');
		return {
			status: 200,
			json: { access_token: 'tok-1', expires_in: 15552000, token_type: 'bearer' },
		};
	};
}

function startFlow(http: HttpClient = tokenHttp()) {
	let capturedUrl = '';
	const flow = runOAuthFlow({
		clientId: 'id',
		clientSecret: 'secret',
		port: 0,
		http,
		openBrowser: (url) => {
			capturedUrl = url;
		},
		timeoutMs: 5000,
	});
	return { flow, authUrl: () => new URL(capturedUrl) };
}

function callbackBase(authUrl: URL): { redirect: URL; state: string } {
	const redirect = new URL(authUrl.searchParams.get('redirect_uri') ?? '');
	const state = authUrl.searchParams.get('state') ?? '';
	return { redirect, state };
}

describe('runOAuthFlow', () => {
	test('resolves tokens when the callback arrives with code and matching state', async () => {
		const bodies: string[] = [];
		const { flow, authUrl } = startFlow(tokenHttp(bodies));
		await new Promise((r) => setTimeout(r, 50));
		const { redirect, state } = callbackBase(authUrl());

		const response = await fetch(`${redirect.href}?code=abc&state=${state}`);

		expect(response.status).toBe(200);
		await expect(flow).resolves.toEqual({ accessToken: 'tok-1', expiresIn: 15552000 });
		// OAuth servers reject codes when the exchanged redirect_uri differs from the authorize one.
		expect(bodies[0]).toContain(encodeURIComponent(redirect.origin + redirect.pathname));
	});

	test('rejects on state mismatch and answers the browser with 400', async () => {
		const { flow, authUrl } = startFlow();
		const rejection = expect(flow).rejects.toThrow(/state/i);
		await new Promise((r) => setTimeout(r, 50));
		const { redirect } = callbackBase(authUrl());

		const response = await fetch(`${redirect.href}?code=abc&state=WRONG`);

		expect(response.status).toBe(400);
		await rejection;
	});

	test('rejects when TickTick redirects with an error instead of a code', async () => {
		const { flow, authUrl } = startFlow();
		const rejection = expect(flow).rejects.toThrow(/access_denied/);
		await new Promise((r) => setTimeout(r, 50));
		const { redirect, state } = callbackBase(authUrl());

		await fetch(`${redirect.href}?error=access_denied&state=${state}`);

		await rejection;
	});

	test('rejects after timeout when no callback ever arrives', async () => {
		let opened = '';
		const flow = runOAuthFlow({
			clientId: 'id',
			clientSecret: 'secret',
			port: 0,
			http: tokenHttp(),
			openBrowser: (url) => {
				opened = url;
			},
			timeoutMs: 100,
		});

		await expect(flow).rejects.toThrow(/timed out/i);
		expect(opened).toContain('https://ticktick.com/oauth/authorize?');
	});
});
