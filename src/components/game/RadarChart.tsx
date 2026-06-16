import {
    Radar,
    RadarChart as RechartsRadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
} from 'recharts';
import { getRadarData } from '@/utils/helpers';
import { useTranslation } from 'react-i18next';

interface RadarChartProps {
    stats: number[];
}

export function RadarChart({ stats }: RadarChartProps) {
    const { t } = useTranslation();
    const data = getRadarData(stats, t);

    return (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <RechartsRadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
                    <PolarGrid stroke="#44403c" />
                    <PolarAngleAxis
                        dataKey="dimension"
                        tick={{ fill: '#a8a29e', fontSize: 11 }}
                        tickLine={false}
                    />
                    <PolarRadiusAxis
                        angle={90}
                        domain={[0, 10]}
                        tick={{ fill: '#78716c', fontSize: 10 }}
                        tickCount={6}
                        axisLine={false}
                    />
                    <Radar
                        name="Perfil"
                        dataKey="value"
                        stroke="#f59e0b"
                        fill="#f59e0b"
                        fillOpacity={0.25}
                        strokeWidth={2}
                    />
                </RechartsRadarChart>
            </ResponsiveContainer>
        </div>
    );
}
