import { describe, expect, test } from 'vitest';
import {
	HttpClient,
	HttpRequest,
	TickTickApiError,
	TickTickClient,
	buildAuthorizeUrl,
	exchangeCode,
} from '../../src/sync/ticktick-client';

function fakeHttp(responses: Array<{ status: number; json: unknown }>): {
	http: HttpClient;
	requests: HttpRequest[];
} {
	const requests: HttpRequest[] = [];
	const queue = [...responses];
	const http: HttpClient = async (req) => {
		requests.push(req);
		return queue.shift() ?? { status: 500, json: null };
	};
	return { http, requests };
}

describe('buildAuthorizeUrl', () => {
	test('includes client id, encoded scope, state, and redirect uri', () => {
		const url = buildAuthorizeUrl({
			clientId: 'my-client',
			redirectUri: 'http://localhost:42813/callback',
			state: 'xyz',
		});

		expect(url.startsWith('https://ticktick.com/oauth/authorize?')).toBe(true);
		expect(url).toContain('client_id=my-client');
		expect(url).toContain('response_type=code');
		expect(url).toContain('state=xyz');
		expect(url).toContain(encodeURIComponent('tasks:write tasks:read'));
		expect(url).toContain(encodeURIComponent('http://localhost:42813/callback'));
	});
});

describe('exchangeCode', () => {
	test('posts basic-auth form request and returns token info', async () => {
		const { http, requests } = fakeHttp([
			{ status: 200, json: { access_token: 'tok-1', expires_in: 15552000, token_type: 'bearer' } },
		]);

		const result = await exchangeCode(http, {
			clientId: 'id',
			clientSecret: 'secret',
			code: 'auth-code',
			redirectUri: 'http://localhost:42813/callback',
		});

		expect(result).toEqual({ accessToken: 'tok-1', expiresIn: 15552000 });
		const req = requests[0];
		expect(req?.url).toBe('https://ticktick.com/oauth/token');
		expect(req?.method).toBe('POST');
		expect(req?.headers['Authorization']).toBe(`Basic ${btoa('id:secret')}`);
		expect(req?.headers['Content-Type']).toContain('application/x-www-form-urlencoded');
		expect(req?.body).toContain('grant_type=authorization_code');
		expect(req?.body).toContain('code=auth-code');
	});

	test('throws TickTickApiError on non-200 response', async () => {
		const { http } = fakeHttp([{ status: 400, json: { error: 'invalid_grant' } }]);

		await expect(
			exchangeCode(http, { clientId: 'i', clientSecret: 's', code: 'bad', redirectUri: 'r' }),
		).rejects.toThrow(TickTickApiError);
	});
});

describe('TickTickClient', () => {
	function makeClient(responses: Array<{ status: number; json: unknown }>) {
		const { http, requests } = fakeHttp(responses);
		return { client: new TickTickClient(http, () => 'tok-1'), requests };
	}

	test('sends bearer token on every request', async () => {
		const { client, requests } = makeClient([{ status: 200, json: [] }]);

		await client.listProjects();

		expect(requests[0]?.headers['Authorization']).toBe('Bearer tok-1');
		expect(requests[0]?.url).toBe('https://api.ticktick.com/open/v1/project');
	});

	test('createProject posts name and returns project', async () => {
		const { client, requests } = makeClient([{ status: 200, json: { id: 'ttp-1', name: 'Alpha' } }]);

		const project = await client.createProject('Alpha');

		expect(project).toEqual({ id: 'ttp-1', name: 'Alpha' });
		expect(requests[0]?.method).toBe('POST');
		expect(requests[0]?.url).toBe('https://api.ticktick.com/open/v1/project');
		expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({ name: 'Alpha' });
	});

	test('createTask posts draft to /task', async () => {
		const { client, requests } = makeClient([
			{ status: 200, json: { id: 'tt-9', projectId: 'ttp-1', title: 'T' } },
		]);

		const created = await client.createTask({ projectId: 'ttp-1', title: 'T', priority: 0 });

		expect(created.id).toBe('tt-9');
		expect(requests[0]?.url).toBe('https://api.ticktick.com/open/v1/task');
	});

	test('updateTask posts to /task/{id}', async () => {
		const { client, requests } = makeClient([{ status: 200, json: { id: 'tt-9' } }]);

		await client.updateTask({ id: 'tt-9', projectId: 'ttp-1', title: 'T2', priority: 1 });

		expect(requests[0]?.url).toBe('https://api.ticktick.com/open/v1/task/tt-9');
	});

	test('completeTask posts to the complete endpoint', async () => {
		const { client, requests } = makeClient([{ status: 200, json: null }]);

		await client.completeTask('ttp-1', 'tt-9');

		expect(requests[0]?.method).toBe('POST');
		expect(requests[0]?.url).toBe(
			'https://api.ticktick.com/open/v1/project/ttp-1/task/tt-9/complete',
		);
	});

	test('getProjectData returns tasks payload', async () => {
		const { client } = makeClient([
			{ status: 200, json: { project: { id: 'ttp-1' }, tasks: [{ id: 'tt-9', title: 'T' }] } },
		]);

		const data = await client.getProjectData('ttp-1');

		expect(data.tasks).toHaveLength(1);
	});

	test('throws TickTickApiError carrying status on 401', async () => {
		const { client } = makeClient([{ status: 401, json: null }]);

		const error = await client.listProjects().catch((e: unknown) => e);

		expect(error).toBeInstanceOf(TickTickApiError);
		expect((error as TickTickApiError).status).toBe(401);
	});
});
