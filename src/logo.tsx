import React from 'react';
import { Platform, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { tokens } from './theme';

/**
 * Optimized vector SVG of the Mobile Marine Doc crest (Riveted Verdigris Shield +
 * Fiberglass weave + Crossed Grinder & Wrench + Medical-Cross Anchor + Invoice Envelope Badge)
 * used for PDFs, web favicons, and HTML headers.
 */
export const BRAND_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="shieldRim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2E8B78"/>
      <stop offset="50%" stop-color="#1A5C52"/>
      <stop offset="100%" stop-color="#0E3832"/>
    </linearGradient>
    <linearGradient id="fiberglassBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#C8B47E"/>
      <stop offset="100%" stop-color="#8C7647"/>
    </linearGradient>
    <linearGradient id="envGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1488A8"/>
      <stop offset="100%" stop-color="#0A4F66"/>
    </linearGradient>
  </defs>
  <!-- Riveted Shield Outer -->
  <path d="M56 6 L102 22 C102 64 92 92 56 110 C20 92 10 64 10 22 Z" fill="url(#shieldRim)" stroke="#082220" stroke-width="3"/>
  <!-- Shield Inner Fiberglass Gold Field -->
  <path d="M56 14 L94 27 C94 61 85 85 56 101 C27 85 18 61 18 27 Z" fill="url(#fiberglassBg)" stroke="#0E3832" stroke-width="2"/>
  <!-- Rivets -->
  <circle cx="56" cy="10" r="2" fill="#9DB5B2"/>
  <circle cx="32" cy="18" r="2" fill="#9DB5B2"/>
  <circle cx="80" cy="18" r="2" fill="#9DB5B2"/>
  <circle cx="15" cy="40" r="2" fill="#9DB5B2"/>
  <circle cx="97" cy="40" r="2" fill="#9DB5B2"/>
  <circle cx="20" cy="70" r="2" fill="#9DB5B2"/>
  <circle cx="92" cy="70" r="2" fill="#9DB5B2"/>
  <!-- Crossed Wrench & Grinder Shafts -->
  <line x1="30" y1="34" x2="80" y2="82" stroke="#1E5E54" stroke-width="7" stroke-linecap="round"/>
  <line x1="82" y1="34" x2="32" y2="82" stroke="#1E5E54" stroke-width="7" stroke-linecap="round"/>
  <circle cx="30" cy="34" r="9" fill="#2A6F64" stroke="#082220" stroke-width="2"/>
  <circle cx="82" cy="34" r="8" fill="#2A6F64" stroke="#082220" stroke-width="2"/>
  <!-- Center Marine Anchor -->
  <circle cx="56" cy="26" r="6" fill="none" stroke="#1A665A" stroke-width="4"/>
  <line x1="42" y1="36" x2="70" y2="36" stroke="#1A665A" stroke-width="5" stroke-linecap="round"/>
  <line x1="56" y1="32" x2="56" y2="84" stroke="#237A6B" stroke-width="7" stroke-linecap="round"/>
  <path d="M30 64 C30 82 44 90 56 92 C68 90 82 82 82 64" fill="none" stroke="#237A6B" stroke-width="6" stroke-linecap="round"/>
  <polygon points="26,66 36,60 35,71" fill="#237A6B"/>
  <polygon points="86,66 76,60 77,71" fill="#237A6B"/>
  <!-- Doc Medical Cross in Anchor Crown -->
  <rect x="53.5" y="76" width="5" height="12" rx="1" fill="#082220"/>
  <rect x="50" y="79.5" width="12" height="5" rx="1" fill="#082220"/>
  <!-- Invoice Envelope Emblem (Bottom Right Crest Overlay) -->
  <g transform="translate(64, 68)">
    <rect x="0" y="0" width="52" height="38" rx="7" fill="url(#envGrad)" stroke="#FFFFFF" stroke-width="2.5"/>
    <path d="M3 4 L26 21 L49 4" fill="none" stroke="#FFF4D2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 34 L19 20 M48 34 L33 20" stroke="#7FD4EA" stroke-width="2.2" stroke-linecap="round"/>
  </g>
</svg>`;

export const BRAND_LOGO_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(BRAND_LOGO_SVG)}`;

/**
 * Crisp cross-platform Mobile Marine Doc + Envelope crest component for React Native & Web.
 */
export function BrandLogo({ size = 46 }: { size?: number }): JSX.Element {
  const shieldSize = size;
  const envW = Math.round(size * 0.54);
  const envH = Math.round(size * 0.42);
  const anchorSize = Math.round(size * 0.52);
  const envIconSize = Math.round(size * 0.28);

  if (Platform.OS === 'web') {
    return (
      <View
        style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}
        accessibilityRole="image"
        accessibilityLabel="Mobile Marine Doc Invoice Logo"
      >
        {React.createElement('img', {
          src: BRAND_LOGO_DATA_URI,
          alt: 'Mobile Marine Doc Logo',
          style: { width: size, height: size, display: 'block' },
        })}
      </View>
    );
  }

  return (
    <View
      style={{
        width: shieldSize,
        height: shieldSize,
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
      }}
      accessibilityRole="image"
      accessibilityLabel="Mobile Marine Doc Invoice Logo"
    >
      {/* Verdigris & Fiberglass Shield Base */}
      <View
        style={{
          width: shieldSize - 4,
          height: shieldSize - 4,
          borderRadius: Math.round(shieldSize * 0.24),
          backgroundColor: '#1A5C52',
          borderWidth: 2,
          borderColor: '#C8B47E',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <MaterialCommunityIcons name="anchor" size={anchorSize} color="#E6D5A7" />
      </View>
      {/* Envelope Badge Overlay */}
      <View
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: envW,
          height: envH,
          borderRadius: 5,
          backgroundColor: '#0B6E8A',
          borderWidth: 1.5,
          borderColor: '#FFFFFF',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Feather name="mail" size={envIconSize} color="#FFFFFF" />
      </View>
    </View>
  );
}
