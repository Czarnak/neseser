import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const STYLES_PATH = fileURLToPath(new URL("../styles.css", import.meta.url));

describe("styles.css encoding", () => {
	it("contains no NUL bytes (UTF-16 corruption guard)", () => {
		const bytes = readFileSync(STYLES_PATH);
		expect(bytes.includes(0)).toBe(false);
	});

	it("decodes as valid UTF-8", () => {
		const bytes = readFileSync(STYLES_PATH);
		const decoder = new TextDecoder("utf-8", { fatal: true });
		expect(() => decoder.decode(bytes)).not.toThrow();
	});
});
