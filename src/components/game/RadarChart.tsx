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

/* Recharts renders presentation attributes, which cannot read CSS variables, so
   each surface passes the palette it belongs to. */
const tones = {
    amber: { plot: '#f59e0b', grid: '#44403c', angle: '#a8a29e', radius: '#78716c' },
    room: { plot: '#22d3ee', grid: 'rgb(148 163 184 / 0.35)', angle: '#94a3b8', radius: '#7c86a3' },
} as const;

interface RadarChartProps {
    stats: number[];
    tone?: keyof typeof tones;
}

export function RadarChart({ stats, tone = 'amber' }: RadarChartProps) {
    const { t } = useTranslation();
    const data = getRadarData(stats, t);
    const palette = tones[tone];

    return (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <RechartsRadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
                    <PolarGrid stroke={palette.grid} />
                    <PolarAngleAxis
                        dataKey="dimension"
                        tick={{ fill: palette.angle, fontSize: 11 }}
                        tickLine={false}
                    />
                    <PolarRadiusAxis
                        angle={90}
                        domain={[0, 10]}
                        tick={{ fill: palette.radius, fontSize: 10 }}
                        tickCount={6}
                        axisLine={false}
                    />
                    <Radar
                        name="Perfil"
                        dataKey="value"
                        stroke={palette.plot}
                        fill={palette.plot}
                        fillOpacity={0.25}
                        strokeWidth={2}
                    />
                </RechartsRadarChart>
            </ResponsiveContainer>
        </div>
    );
}
