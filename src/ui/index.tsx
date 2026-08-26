import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

export async function startInteractiveUI(): Promise<void> {
  const instance = render(<App />);
  await instance.waitUntilExit();
}
