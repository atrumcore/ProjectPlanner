import type { PhaseType, PhaseColorScheme } from '../types/gantt';

export const PHASE_PRESETS: Record<PhaseType, PhaseColorScheme> = {
  analysis: {
    fill: '#f5e6a3',
    stroke: '#b89400',
    text: '#5c4a00',
    label: 'ANALYSIS & DESIGN',
  },
  development: {
    fill: '#fcdea4',
    stroke: '#cc6d00',
    text: '#6b3800',
    label: 'DEVELOPMENT',
  },
  sit: {
    fill: '#c6e9c6',
    stroke: '#2e7c2e',
    text: '#174d17',
    label: 'SIT',
  },
  uat: {
    fill: '#beddfa',
    stroke: '#1565b5',
    text: '#0a3672',
    label: 'UAT',
  },
  live: {
    fill: '#f8baba',
    stroke: '#b52222',
    text: '#6b1010',
    label: 'LIVE',
  },
  concept: {
    fill: '#f5e6a3',
    stroke: '#b89400',
    text: '#5c4a00',
    label: 'CONCEPTUALISATION',
  },
  custom: {
    fill: '#e0e0e0',
    stroke: '#808080',
    text: '#333333',
    label: 'CUSTOM',
  },
};

export const PHASE_TYPE_OPTIONS: { value: PhaseType; label: string }[] = [
  { value: 'analysis', label: 'Analysis & Design' },
  { value: 'development', label: 'Development' },
  { value: 'sit', label: 'SIT' },
  { value: 'uat', label: 'UAT' },
  { value: 'live', label: 'Live' },
  { value: 'concept', label: 'Conceptualisation' },
  { value: 'custom', label: 'Custom' },
];
