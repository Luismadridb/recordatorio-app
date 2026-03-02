import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Modal,
    TextInput,
    Switch,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
    ScrollView
} from 'react-native';
import api from '../services/api';
import { User, Phone, Clock, Plus, Trash2, X, Save } from 'lucide-react-native';

export default function Predicadores() {
    const [predicadores, setPredicadores] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [nuevoNombre, setNuevoNombre] = useState('');
    const [nuevoTelefono, setNuevoTelefono] = useState('');
    const [nuevoSoloTarde, setNuevoSoloTarde] = useState(false);

    const loadPredicadores = async () => {
        try {
            const res = await api.get('/predicadores');
            setPredicadores(res.data);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudieron cargar los predicadores');
        }
    };

    useEffect(() => {
        loadPredicadores();
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadPredicadores();
        setRefreshing(false);
    };

    const handleCreate = async () => {
        if (!nuevoNombre || !nuevoTelefono) {
            Alert.alert('Error', 'Nombre y teléfono son obligatorios');
            return;
        }

        setLoading(true);
        try {
            let tel = nuevoTelefono.trim();
            if (!tel.startsWith('whatsapp:')) {
                tel = 'whatsapp:' + tel;
            }

            await api.post('/predicadores', {
                nombre: nuevoNombre,
                telefono: tel,
                solo_tarde: nuevoSoloTarde
            });

            setModalVisible(false);
            setNuevoNombre('');
            setNuevoTelefono('');
            setNuevoSoloTarde(false);
            loadPredicadores();
            Alert.alert('¡Éxito!', 'Hermano agregado correctamente');
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo crear el registro');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (id, nombre) => {
        Alert.alert(
            'Eliminar Hermano',
            `¿Estás seguro que deseas eliminar a ${nombre}? Esto borrará también sus asignaciones futuras.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.delete(`/predicadores/${id}`);
                            loadPredicadores();
                        } catch (error) {
                            Alert.alert('Error', 'No se pudo eliminar');
                        }
                    }
                }
            ]
        );
    };

    const updateDisponibilidad = async (id, currentVal) => {
        try {
            await api.patch(`/predicadores/${id}/disponibilidad`, {
                solo_tarde: !currentVal
            });
            loadPredicadores();
        } catch (error) {
            Alert.alert('Error', 'No se pudo actualizar la disponibilidad');
        }
    };

    const renderItem = ({ item, index }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.nombre.charAt(0)}</Text>
                </View>
                <View style={styles.nameContainer}>
                    <Text style={styles.idText}>#{index + 1}</Text>
                    <Text style={styles.nameText}>{item.nombre}</Text>
                </View>
                <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item.id, item.nombre)}
                >
                    <Trash2 size={18} color="#ef4444" />
                </TouchableOpacity>
            </View>

            <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                    <Phone size={16} color="#94a3b8" />
                    <Text style={styles.infoText}>{item.telefono}</Text>
                </View>

                <View style={[styles.infoRow, { justifyContent: 'space-between' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Clock size={16} color="#94a3b8" />
                        <Text style={styles.infoText}>
                            {item.solo_tarde ? 'Solo Despedida (19:00)' : 'Día Completo'}
                        </Text>
                    </View>
                    <Switch
                        value={item.solo_tarde}
                        onValueChange={() => updateDisponibilidad(item.id, item.solo_tarde)}
                        trackColor={{ false: '#334155', true: '#4f46e5' }}
                        thumbColor={'#fff'}
                    />
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <FlatList
                data={predicadores}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />
                }
                ListEmptyComponent={
                    <Text style={styles.empty}>No hay hermanos registrados aún.</Text>
                }
            />

            <TouchableOpacity
                style={styles.fab}
                onPress={() => setModalVisible(true)}
            >
                <Plus color="#fff" size={28} />
            </TouchableOpacity>

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
                                    <Text style={styles.modalTitle}>Nuevo Hermano</Text>
                                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                                        <X color="#94a3b8" size={24} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView
                                    contentContainerStyle={styles.form}
                                    showsVerticalScrollIndicator={false}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.label}>Nombre Completo</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={nuevoNombre}
                                            onChangeText={setNuevoNombre}
                                            placeholder="Ej: Juan Pérez"
                                            placeholderTextColor="#64748b"
                                        />
                                    </View>

                                    <View style={styles.inputGroup}>
                                        <Text style={styles.label}>WhatsApp (con +569...)</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={nuevoTelefono}
                                            onChangeText={setNuevoTelefono}
                                            placeholder="+56912345678"
                                            placeholderTextColor="#64748b"
                                            keyboardType="phone-pad"
                                        />
                                    </View>

                                    <View style={styles.switchGroup}>
                                        <Text style={styles.label}>Solo disponible en la tarde</Text>
                                        <Switch
                                            value={nuevoSoloTarde}
                                            onValueChange={setNuevoSoloTarde}
                                            trackColor={{ false: '#334155', true: '#4f46e5' }}
                                            thumbColor={'#fff'}
                                        />
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                                        onPress={handleCreate}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <>
                                                <Save color="#fff" size={20} />
                                                <Text style={styles.saveBtnText}>Guardar Hermano</Text>
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
        paddingBottom: 100, // Extra padding for FAB/Tabs
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
        alignItems: 'center',
        marginBottom: 12,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#4f46e5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 18,
    },
    nameContainer: {
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
    },
    cardBody: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        paddingTop: 12,
        gap: 8,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    infoText: {
        color: '#94a3b8',
        fontSize: 14,
    },
    empty: {
        color: '#94a3b8',
        textAlign: 'center',
        marginTop: 40,
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#4f46e5',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
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
        maxHeight: '90%', // Limit height on smaller screens
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        color: '#f8fafc',
        fontSize: 22,
        fontWeight: '700',
    },
    form: {
        gap: 20,
        paddingBottom: 40, // Space for keyboard
    },
    inputGroup: {
        gap: 8,
    },
    label: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '500',
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
    switchGroup: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 12,
        borderRadius: 12,
    },
    saveBtn: {
        backgroundColor: '#4f46e5',
        borderRadius: 12,
        padding: 18,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        marginTop: 10,
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
