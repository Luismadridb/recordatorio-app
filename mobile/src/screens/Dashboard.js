import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import api from '../services/api';
import { Users, Calendar, MessageSquare } from 'lucide-react-native';

const StatCard = ({ title, value, icon: Icon, color }) => (
    <View style={styles.statCard}>
        <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
            <Icon color={color} size={24} />
        </View>
        <View>
            <Text style={styles.statTitle}>{title}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </View>
    </View>
);

export default function Dashboard() {
    const [stats, setStats] = useState({
        hermanos: '...',
        proximo: '...',
        pendientes: '...'
    });
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async () => {
        try {
            const [pRes, aRes, rRes] = await Promise.all([
                api.get('/predicadores'),
                api.get('/asignaciones'),
                api.get('/recordatorios')
            ]);

            const a = aRes.data;
            const r = rRes.data;

            // Próximo culto
            const hoy = new Date();
            const futuros = a.filter(asig => new Date(asig.fecha_sabado) >= hoy);
            futuros.sort((a, b) => new Date(a.fecha_sabado) - new Date(b.fecha_sabado));

            const proximoStr = futuros.length > 0
                ? new Date(futuros[0].fecha_sabado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                : 'Sin agendar';

            setStats({
                hermanos: pRes.data.length,
                proximo: proximoStr,
                pendientes: r.filter(rec => !rec.enviado && rec.intentos < 3).length
            });
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />
            }
        >
            <View style={styles.header}>
                <Text style={styles.welcome}>¡Bienvenido!</Text>
                <Text style={styles.subtitle}>Resumen del sistema de predicadores</Text>
            </View>

            <View style={styles.statsGrid}>
                <StatCard
                    title="Hermanos Activos"
                    value={stats.hermanos}
                    icon={Users}
                    color="#4f46e5"
                />
                <StatCard
                    title="Próximo Culto"
                    value={stats.proximo}
                    icon={Calendar}
                    color="#10b981"
                />
                <StatCard
                    title="Msjs Pendientes"
                    value={stats.pendientes}
                    icon={MessageSquare}
                    color="#f59e0b"
                />
            </View>
        </ScrollView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    header: {
        padding: 24,
        paddingTop: 40,
    },
    welcome: {
        fontSize: 28,
        fontWeight: '700',
        color: '#f8fafc',
    },
    subtitle: {
        fontSize: 16,
        color: '#94a3b8',
        marginTop: 4,
    },
    statsGrid: {
        padding: 16,
        gap: 16,
    },
    statCard: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    iconContainer: {
        width: 52,
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    statTitle: {
        fontSize: 14,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    statValue: {
        fontSize: 22,
        fontWeight: '700',
        color: '#f8fafc',
        marginTop: 4,
    }
});
