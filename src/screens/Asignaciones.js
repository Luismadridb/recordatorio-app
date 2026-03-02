import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Modal,
    TextInput,
    Platform,
    KeyboardAvoidingView,
    ScrollView,
    TouchableWithoutFeedback,
    Keyboard
} from 'react-native';
import api from '../services/api';
import {
    Calendar,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    Trash2,
    Dices,
    Plus,
    X,
    Save,
    User
} from 'lucide-react-native';

const StatusBadge = ({ estado }) => {
    const configs = {
        'pendiente': { color: '#f59e0b', text: 'Pendiente', icon: AlertCircle },
        'confirmado': { color: '#10b981', text: 'Confirmado', icon: CheckCircle },
        'rechazado': { color: '#ef4444', text: 'Rechazado', icon: XCircle }
    };
    const config = configs[estado] || { color: '#94a3b8', text: estado, icon: AlertCircle };
    const Icon = config.icon;

    return (
        <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
            <Icon size={12} color={config.color} />
            <Text style={[styles.badgeText, { color: config.color }]}>{config.text}</Text>
        </View>
    );
};

export default function Asignaciones() {
    const [asignaciones, setAsignaciones] = useState([]);
    const [preachers, setPreachers] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedPreacher, setSelectedPreacher] = useState(null);
    const [selectedTime, setSelectedTime] = useState('10:30');
    const [selectedDate, setSelectedDate] = useState('');

    const getNextSaturday = () => {
        const d = new Date();
        d.setDate(d.getDate() + (6 - d.getDay() + 7) % 7);
        return d.toISOString().split('T')[0];
    };

    const loadData = async () => {
        try {
            const [asigRes, predRes] = await Promise.all([
                api.get('/asignaciones'),
                api.get('/predicadores')
            ]);
            const sorted = asigRes.data.sort((a, b) => new Date(a.fecha_sabado) - new Date(b.fecha_sabado));
            setAsignaciones(sorted);
            setPreachers(predRes.data);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudieron cargar los datos');
        }
    };

    useEffect(() => {
        loadData();
        setSelectedDate(getNextSaturday());
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleSorteo = () => {
        Alert.alert(
            'Sorteo Rápido',
            '¿Deseas realizar el sorteo inteligente para el próximo sábado ahora mismo?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: '¡Sorteo!',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const res = await api.post('/asignaciones', {});
                            if (res.data.error) {
                                Alert.alert('Aviso', res.data.error);
                            } else {
                                Alert.alert('¡Éxito!', res.data.mensaje || 'Sorteo realizado con éxito.');
                                loadData();
                            }
                        } catch (error) {
                            const msg = error.response?.data?.error || 'No se pudo realizar el sorteo.';
                            Alert.alert('Error', msg);
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleManualAssign = async () => {
        if (!selectedPreacher || !selectedDate || !selectedTime) {
            Alert.alert('Error', 'Por favor selecciona un hermano, fecha y hora.');
            return;
        }

        setLoading(true);
        try {
            await api.post('/asignaciones', {
                predicador_id: selectedPreacher.id,
                fecha_sabado: selectedDate,
                hora_culto: selectedTime
            });
            setModalVisible(false);
            setSelectedPreacher(null);
            loadData();
            Alert.alert('¡Éxito!', 'Asignación creada manualmente.');
        } catch (error) {
            Alert.alert('Error', error.response?.data?.error || 'No se pudo crear la asignación.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (id) => {
        Alert.alert(
            'Eliminar Culto',
            '¿Estás seguro que deseas eliminar esta asignación y cancelar los recordatorios?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.delete(`/asignaciones/${id}`);
                            loadData();
                        } catch (error) {
                            Alert.alert('Error', 'No se pudo eliminar');
                        }
                    }
                }
            ]
        );
    };

    const renderItem = ({ item, index }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <Text style={styles.idText}>#{index + 1}</Text>
                    <Text style={styles.nameText}>{item.predicador_nombre}</Text>
                </View>
                <StatusBadge estado={item.estado} />
                <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item.id)}
                >
                    <Trash2 size={18} color="#ef4444" />
                </TouchableOpacity>
            </View>

            <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                    <Calendar size={16} color="#94a3b8" />
                    <Text style={styles.infoText}>
                        {new Date(item.fecha_sabado).toLocaleDateString('es-ES', {
                            weekday: 'long', day: 'numeric', month: 'long'
                        })}
                    </Text>
                </View>
                <View style={styles.infoRow}>
                    <Clock size={16} color="#94a3b8" />
                    <Text style={styles.timeBadge}>{item.hora_culto}</Text>
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {loading && !modalVisible && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                    <Text style={styles.loadingText}>Procesando...</Text>
                </View>
            )}

            <FlatList
                data={asignaciones}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />
                }
                ListEmptyComponent={
                    <Text style={styles.empty}>No hay cultos programados.</Text>
                }
            />

            {/* FABs */}
            <View style={styles.fabContainer}>
                <TouchableOpacity
                    style={[styles.smallFab, { backgroundColor: '#4f46e5' }]}
                    onPress={() => setModalVisible(true)}
                >
                    <Plus color="#fff" size={24} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.mainFab}
                    onPress={handleSorteo}
                >
                    <Dices color="#fff" size={28} />
                </TouchableOpacity>
            </View>

            {/* Modal de Asignación Manual */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView
                            behavior={Platform.OS === "ios" ? "padding" : "height"}
                            style={styles.keyboardAvoidingView}
                        >
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <View>
                                        <Text style={styles.modalTitle}>Asignación Manual</Text>
                                        <Text style={styles.modalSubtitle}>Selecciona al hermano y la hora</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                                        <X color="#94a3b8" size={24} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.form}
                                >
                                    <Text style={styles.label}>1. Seleccionar Hermano</Text>
                                    <View style={styles.preacherList}>
                                        {preachers.map(p => (
                                            <TouchableOpacity
                                                key={p.id}
                                                style={[
                                                    styles.preacherChip,
                                                    selectedPreacher?.id === p.id && styles.preacherChipSelected
                                                ]}
                                                onPress={() => setSelectedPreacher(p)}
                                            >
                                                <User size={14} color={selectedPreacher?.id === p.id ? '#fff' : '#818cf8'} />
                                                <Text style={[
                                                    styles.preacherChipText,
                                                    selectedPreacher?.id === p.id && styles.preacherChipTextSelected
                                                ]}>{p.nombre}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <Text style={styles.label}>2. Fecha (Sábado)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={selectedDate}
                                        onChangeText={setSelectedDate}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor="#64748b"
                                    />

                                    <Text style={styles.label}>3. Hora del Culto</Text>
                                    <View style={styles.timeGrid}>
                                        {['10:30', '15:00', '19:00'].map(t => (
                                            <TouchableOpacity
                                                key={t}
                                                style={[
                                                    styles.timeChip,
                                                    selectedTime === t && styles.timeChipSelected
                                                ]}
                                                onPress={() => setSelectedTime(t)}
                                            >
                                                <Text style={[
                                                    styles.timeChipText,
                                                    selectedTime === t && styles.timeChipTextSelected
                                                ]}>{t}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                                        onPress={handleManualAssign}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <>
                                                <Save color="#fff" size={20} />
                                                <Text style={styles.saveBtnText}>Confirmar Asignación</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    list: {
        padding: 16,
        paddingBottom: 120, // Space for double FAB
    },
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerLeft: {
        flex: 1,
    },
    idText: {
        color: '#818cf8',
        fontSize: 12,
        fontWeight: '700',
    },
    nameText: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '600',
    },
    deleteBtn: {
        padding: 8,
        marginLeft: 10,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    cardBody: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        paddingTop: 12,
        gap: 10,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    infoText: {
        color: '#94a3b8',
        fontSize: 14,
        textTransform: 'capitalize'
    },
    timeBadge: {
        backgroundColor: 'rgba(79, 70, 229, 0.2)',
        color: '#818cf8',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        fontSize: 12,
        fontWeight: '600',
    },
    empty: {
        color: '#94a3b8',
        textAlign: 'center',
        marginTop: 40,
    },
    fabContainer: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        alignItems: 'center',
        gap: 12,
    },
    mainFab: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    smallFab: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    loadingText: {
        color: '#f8fafc',
        marginTop: 12,
        fontSize: 16,
        fontWeight: '600',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    keyboardAvoidingView: {
        width: '100%',
    },
    modalContent: {
        backgroundColor: '#1e293b',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    modalTitle: {
        color: '#f8fafc',
        fontSize: 22,
        fontWeight: '700',
    },
    modalSubtitle: {
        color: '#94a3b8',
        fontSize: 14,
        marginTop: 2,
    },
    form: {
        gap: 16,
        paddingBottom: 40,
    },
    label: {
        color: '#f8fafc',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 8,
    },
    preacherList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    preacherChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(129, 140, 248, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.2)',
        gap: 6,
    },
    preacherChipSelected: {
        backgroundColor: '#4f46e5',
        borderColor: '#4f46e5',
    },
    preacherChipText: {
        color: '#818cf8',
        fontSize: 13,
        fontWeight: '500',
    },
    preacherChipTextSelected: {
        color: '#fff',
    },
    timeGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    timeChip: {
        flex: 1,
        backgroundColor: '#0f172a',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    timeChipSelected: {
        backgroundColor: '#4f46e5',
        borderColor: '#4f46e5',
    },
    timeChipText: {
        color: '#94a3b8',
        fontWeight: '600',
    },
    timeChipTextSelected: {
        color: '#fff',
    },
    input: {
        backgroundColor: '#0f172a',
        borderRadius: 12,
        padding: 14,
        color: '#f8fafc',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        fontSize: 16,
    },
    saveBtn: {
        backgroundColor: '#10b981',
        borderRadius: 12,
        padding: 18,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        marginTop: 12,
    },
    saveBtnDisabled: {
        opacity: 0.6,
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    }
});
