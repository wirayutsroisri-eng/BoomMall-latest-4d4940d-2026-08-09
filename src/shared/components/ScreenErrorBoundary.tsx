import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/shared/theme/colors';

type Props = { children: ReactNode; title?: string };
type State = { error: Error | null };

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[ScreenErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{this.props.title ?? 'เปิดหน้านี้ไม่สำเร็จ'}</Text>
        <Text style={styles.body}>{this.state.error.message}</Text>
        <Pressable
          style={styles.btn}
          onPress={() => {
            this.setState({ error: null });
            if (router.canGoBack()) router.back();
          }}
        >
          <Text style={styles.btnText}>ย้อนกลับ</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  body: { marginTop: 8, fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  btn: {
    marginTop: 20,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
