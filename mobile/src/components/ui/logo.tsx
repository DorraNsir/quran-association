import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/**
 * The bundled calligraphy mark (copied from frontend/public/brand). The web
 * app can also show an admin-uploaded logo from GET /api/public/site-settings;
 * that will be wired once public settings are used by the mobile app.
 */
export function LogoMark({ size = 96 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/brand/logo-mark.png')}
      style={[styles.image, { width: size * 0.914, height: size }]}
      contentFit="contain"
      accessibilityIgnoresInvertColors
      accessible={false}
    />
  );
}

const styles = StyleSheet.create({ image: { alignSelf: 'center' } });
