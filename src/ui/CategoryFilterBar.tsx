import type { CategoryOption } from '../core/category-data';

interface Props {
	options: CategoryOption[];
	active: string | null;
	onSelect: (active: string | null) => void;
}

/**
 * Single-select category filter shared by every view: an "All" chip plus one
 * colored chip per available category. Hidden entirely when there is nothing to
 * filter by (no registered categories and no categorized projects).
 */
export function CategoryFilterBar({ options, active, onSelect }: Props) {
	if (options.length === 0) return null;

	return (
		<div className="ns-category-bar" role="group" aria-label="Filter by category">
			<button
				type="button"
				className={`ns-category-chip${active === null ? ' ns-category-chip-active' : ''}`}
				aria-pressed={active === null}
				onClick={() => onSelect(null)}
			>
				All
			</button>
			{options.map((option) => {
				const isActive = active === option.name;
				return (
					<button
						key={option.name}
						type="button"
						className={`ns-category-chip${isActive ? ' ns-category-chip-active' : ''}`}
						aria-pressed={isActive}
						style={isActive ? { borderColor: option.color } : undefined}
						onClick={() => onSelect(isActive ? null : option.name)}
					>
						<span className="ns-category-dot" style={{ backgroundColor: option.color }} />
						{option.name}
					</button>
				);
			})}
		</div>
	);
}
