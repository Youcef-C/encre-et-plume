'use client';

import { createContext, useContext } from 'react';

// ponytail: stub 0 until F-5 wires the unread service
export const UnreadContext = createContext<number>(0);
export const useUnreadCount = () => useContext(UnreadContext);
