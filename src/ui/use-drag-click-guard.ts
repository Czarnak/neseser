import { useRef } from 'react';

/**
 * The browser fires a click on a dragged element right after drop; this guard
 * lets components swallow it so finishing a drag does not also trigger the
 * element's click action. Call markDragStart/markDragEnd from DndContext and
 * gate click handlers on canClick().
 */
export function useDragClickGuard(): {
	markDragStart: () => void;
	markDragEnd: () => void;
	canClick: () => boolean;
} {
	const dragHappenedRef = useRef(false);
	return {
		markDragStart: () => {
			dragHappenedRef.current = true;
		},
		markDragEnd: () => {
			// The post-drop click fires synchronously before this timeout runs.
			window.setTimeout(() => {
				dragHappenedRef.current = false;
			}, 0);
		},
		canClick: () => !dragHappenedRef.current,
	};
}
