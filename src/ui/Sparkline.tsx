import { sparklineGeometry } from '../core/burndown-data';

interface SparklineProps {
	values: number[];
	width?: number;
	height?: number;
}

export function Sparkline({ values, width = 120, height = 28 }: SparklineProps) {
	const geo = sparklineGeometry(values, width, height);
	return (
		<svg
			className="ns-sparkline"
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
		>
			<polygon className="ns-sparkline-area" points={geo.area} />
			<polyline className="ns-sparkline-line" points={geo.line} />
		</svg>
	);
}
