import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { LayoutDashboard, Users, CalendarDays, LogOut } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, View, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Dashboard from './src/screens/Dashboard';
import Predicadores from './src/screens/Predicadores';
import Asignaciones from './src/screens/Asignaciones';
import LoginScreen from './src/screens/LoginScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const password = await AsyncStorage.getItem('admin_password');
      if (password) {
        setIsLoggedIn(true);
      }
    } catch (e) {
      console.error('Error al revisar login', e);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('admin_password');
    setIsLoggedIn(false);
  };

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaProvider>
        <LoginScreen onLogin={() => setIsLoggedIn(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              if (route.name === 'Inicio') return <LayoutDashboard size={size} color={color} />;
              if (route.name === 'Hermanos') return <Users size={size} color={color} />;
              if (route.name === 'Cultos') return <CalendarDays size={size} color={color} />;
            },
            tabBarActiveTintColor: '#818cf8',
            tabBarInactiveTintColor: '#94a3b8',
            tabBarStyle: {
              backgroundColor: '#1e293b',
              borderTopColor: 'rgba(255,255,255,0.1)',
              height: Platform.OS === 'ios' ? 88 : 68,
              paddingBottom: Platform.OS === 'ios' ? 28 : 12,
              paddingTop: 12,
              borderTopWidth: 1,
              elevation: 0,
            },
            headerStyle: {
              backgroundColor: '#0f172a',
            },
            headerTintColor: '#fff',
            headerShadowVisible: false,
            headerRight: () => (
              <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
                <LogOut size={22} color="#94a3b8" />
              </TouchableOpacity>
            ),
          })}
        >
          <Tab.Screen name="Inicio" component={Dashboard} options={{ title: 'Dashboard' }} />
          <Tab.Screen name="Hermanos" component={Predicadores} options={{ title: 'Predicadores' }} />
          <Tab.Screen name="Cultos" component={Asignaciones} options={{ title: 'Programación' }} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
