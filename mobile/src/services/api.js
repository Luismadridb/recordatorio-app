import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_IP = '172.20.10.2';
const BASE_URL = `http://${LOCAL_IP}:3000`;

const api = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
});

// Interceptor para añadir la contraseña en cada petición
api.interceptors.request.use(async (config) => {
    const password = await AsyncStorage.getItem('admin_password');
    if (password) {
        config.headers['x-admin-password'] = password;
    }
    return config;
});

export default api;
