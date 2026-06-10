import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { HttpClient, TokenInfo, buildAuthorizeUrl, exchangeCode } from './ticktick-client';

export interface OAuthFlowOptions {
	clientId: string;
	clientSecret: string;
	/** Port for the temporary callback server; 0 picks an ephemeral port (tests). */
	port: number;
	http: HttpClient;
	openBrowser: (url: string) => void;
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_PAGE = '<html><body><h2>Neseser connected to TickTick.</h2>You can close this tab.</body></html>';
const FAILURE_PAGE = '<html><body><h2>Neseser: TickTick authorization failed.</h2>Check Obsidian for details.</body></html>';

/**
 * Desktop-only OAuth authorization-code flow: starts a one-shot localhost
 * callback server, opens the TickTick consent page in the browser, exchanges
 * the returned code for an access token.
 */
export function runOAuthFlow(options: OAuthFlowOptions): Promise<TokenInfo> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const state = randomUUID();

	return new Promise<TokenInfo>((resolve, reject) => {
		let settled = false;
		// Captured at listen time: server.address() is gone after close(), and the
		// token exchange must send the exact redirect_uri used in the authorize step.
		let redirectUri = '';

		const server = createServer((req, res) => {
			const url = new URL(req.url ?? '/', 'http://localhost');
			if (url.pathname !== '/callback') {
				res.writeHead(404).end();
				return;
			}

			const fail = (status: number, error: Error): void => {
				res.writeHead(status, { 'Content-Type': 'text/html' }).end(FAILURE_PAGE);
				finish(() => reject(error));
			};

			const oauthError = url.searchParams.get('error');
			if (oauthError) {
				fail(400, new Error(`TickTick authorization failed: ${oauthError}`));
				return;
			}
			if (url.searchParams.get('state') !== state) {
				fail(400, new Error('OAuth state mismatch — possible CSRF, try connecting again'));
				return;
			}
			const code = url.searchParams.get('code');
			if (!code) {
				fail(400, new Error('TickTick callback carried no authorization code'));
				return;
			}

			res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_PAGE);
			finish(() =>
				exchangeCode(options.http, {
					clientId: options.clientId,
					clientSecret: options.clientSecret,
					code,
					redirectUri,
				}).then(resolve, reject),
			);
		});

		const timer = setTimeout(() => {
			finish(() => reject(new Error(`TickTick authorization timed out after ${timeoutMs / 1000}s`)));
		}, timeoutMs);

		function finish(settle: () => void): void {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			server.close();
			settle();
		}

		server.on('error', (error) => {
			finish(() => reject(new Error(`Could not start OAuth callback server: ${error.message}`)));
		});

		server.listen(options.port, () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : options.port;
			redirectUri = `http://localhost:${port}/callback`;
			options.openBrowser(
				buildAuthorizeUrl({ clientId: options.clientId, redirectUri, state }),
			);
		});
	});
}
