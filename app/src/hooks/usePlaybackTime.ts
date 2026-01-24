import React from 'react';

// Lightweight playback time tracker - separate from main store to avoid re-renders
let currentTime = 0;
const listeners = new Set<(time: number) => void>();

export const setPlaybackTime = (time: number) => {
  currentTime = time;
  listeners.forEach(listener => listener(time));
};

export const getPlaybackTime = () => currentTime;

export const subscribeToPlaybackTime = (listener: (time: number) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Hook for components that need to react to time changes
export const usePlaybackTime = () => {
  const [time, setTime] = React.useState(getPlaybackTime);
  
  React.useEffect(() => {
    const unsubscribe = subscribeToPlaybackTime(setTime);
    return unsubscribe;
  }, []);
  
  return time;
};

