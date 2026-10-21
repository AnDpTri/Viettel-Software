import { SpendLineChart, type SpendLineProps } from '../../ui/charts/SpendLineChart';

export type Props = SpendLineProps;

/**
 * Biểu đồ đường chi tiêu lũy kế trong tháng (Copilot Money style).
 */
export function SpendLine(props: SpendLineProps) {
  return <SpendLineChart {...props} />;
}
