const revealItems = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window) {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					entry.target.classList.add("is-visible");
					observer.unobserve(entry.target);
				}
			}
		},
		{ threshold: 0.12 },
	);

	for (const item of revealItems) observer.observe(item);
} else {
	for (const item of revealItems) item.classList.add("is-visible");
}

const copyButtons = document.querySelectorAll("[data-copy]");

for (const button of copyButtons) {
	button.addEventListener("click", async () => {
		const targetSelector = button.getAttribute("data-copy");
		const target = targetSelector ? document.querySelector(targetSelector) : null;
		const text = target?.textContent?.trim();
		const status = button.closest(".install-card")?.querySelector(".copy-status");

		if (!text) return;

		try {
			await navigator.clipboard.writeText(text);
			if (status) status.textContent = "Repository URL copied.";
		} catch {
			if (status) status.textContent = "Select and copy the repository URL above.";
		}
	});
}
