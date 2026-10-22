'use client';

import { createContext } from 'react';

// null: outside the window, 0: visible, 1: neighboring row.
export const PreviewPriority = createContext<number | null>(0);
