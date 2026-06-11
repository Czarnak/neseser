import type { TickTickTaskDraft } from './mapping';

/**
 * Official TickTick Open API (developer.ticktick.com). Endpoints and shapes
 * are training-data sourced and verified against the live API during testing.
 */
const AUTH_BASE = 'https://ticktick.com/oauth';
const API_BASE = 'https://api.ticktick.com/open/v1';
const SCOPE = 'tasks:write tasks:read';

export interface HttpRequest {
	url: string;
	method: 'GET' | 'POST' | 'DELETE';
	headers: Record<string, string>;
	body?: string;
}

export interface HttpResponse {
	status: number;
	json: unknown;
}

/** Injected so the client is testable; main.ts adapts Obsidian's requestUrl. */
export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

export class TickTickApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = 'TickTickApiError';
	}
}

export interface AuthorizeUrlParams {
	clientId: string;
	redirectUri: string;
	state: string;
}

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
	// Not URLSearchParams: it encodes spaces as '+', OAuth servers expect %20 in the scope.
	const query = Object.entries({
		client_id: params.clientId,
		scope: SCOPE,
		state: params.state,
		redirect_uri: params.redirectUri,
		response_type: 'code',
	})
		.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
		.join('&');
	return `${AUTH_BASE}/authorize?${query}`;
}

export interface ExchangeCodeParams {
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
}

export interface TokenInfo {
	accessToken: string;
	expiresIn: number;
}

export async function exchangeCode(http: HttpClient, params: ExchangeCodeParams): Promise<TokenInfo> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code: params.code,
		redirect_uri: params.redirectUri,
		scope: SCOPE,
	});

	const response = await http({
		url: `${AUTH_BASE}/token`,
		method: 'POST',
		headers: {
			Authorization: `Basic ${btoa(`${params.clientId}:${params.clientSecret}`)}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	});

	if (response.status !== 200) {
		throw new TickTickApiError(response.status, `Token exchange failed (${response.status})`);
	}

	const json = response.json as { access_token: string; expires_in: number };
	return { accessToken: json.access_token, expiresIn: json.expires_in };
}

export interface TickTickProject {
	id: string;
	name: string;
}

export interface TickTickTask extends TickTickTaskDraft {
	id: string;
	modifiedTime?: string;
}

export interface TickTickProjectData {
	project: TickTickProject;
	tasks: TickTickTask[];
}

export class TickTickClient {
	constructor(
		private http: HttpClient,
		private getToken: () => string,
		private base: string = API_BASE,
	) {}

	listProjects(): Promise<TickTickProject[]> {
		return this.request('GET', '/project') as Promise<TickTickProject[]>;
	}

	createProject(name: string): Promise<TickTickProject> {
		return this.request('POST', '/project', { name }) as Promise<TickTickProject>;
	}

	getProjectData(projectId: string): Promise<TickTickProjectData> {
		return this.request('GET', `/project/${projectId}/data`) as Promise<TickTickProjectData>;
	}

	getTask(projectId: string, taskId: string): Promise<TickTickTask> {
		return this.request('GET', `/project/${projectId}/task/${taskId}`) as Promise<TickTickTask>;
	}

	createTask(draft: TickTickTaskDraft): Promise<TickTickTask> {
		return this.request('POST', '/task', draft) as Promise<TickTickTask>;
	}

	updateTask(draft: TickTickTaskDraft & { id: string }): Promise<TickTickTask> {
		return this.request('POST', `/task/${draft.id}`, draft) as Promise<TickTickTask>;
	}

	async completeTask(projectId: string, taskId: string): Promise<void> {
		await this.request('POST', `/project/${projectId}/task/${taskId}/complete`);
	}

	async deleteTask(projectId: string, taskId: string): Promise<void> {
		await this.request('DELETE', `/project/${projectId}/task/${taskId}`);
	}

	private async request(
		method: HttpRequest['method'],
		path: string,
		body?: unknown,
	): Promise<unknown> {
		const response = await this.http({
			url: `${this.base}${path}`,
			method,
			headers: {
				Authorization: `Bearer ${this.getToken()}`,
				'Content-Type': 'application/json',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		if (response.status < 200 || response.status >= 300) {
			throw new TickTickApiError(response.status, `TickTick API ${method} ${path} failed (${response.status})`);
		}
		return response.json;
	}
}
