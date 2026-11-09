import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  setAuthTokenGetter,
  claimUserLinks,
  getUserLinks,
  getRateLimits,
  peekGuestDeviceId,
  clearGuestLocalInfo,
} from '../services/api.js';

const AuthContext = createContext({
  isLoaded: true,
  isSignedIn: false,
  user: null,
  getToken: async () => null,
  hasClerk: false,
  userLinks: [],
  setUserLinks: () => {},
  isLoadingLinks: false,
  refreshUserLinks: async () => [],
  rateLimits: null,
  refreshLimits: async () => null,
});

function ClerkInnerAuthProvider({ children, onClaimSuccess }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [userLinks, setUserLinks] = useState([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [rateLimits, setRateLimits] = useState(null);

  const syncedUserIdRef = useRef(null);
  const lastGetterStateRef = useRef(null);
  const getTokenRef = useRef(getToken);
  const isSignedInRef = useRef(isSignedIn);
  const onClaimSuccessRef = useRef(onClaimSuccess);

  getTokenRef.current = getToken;
  isSignedInRef.current = isSignedIn;
  onClaimSuccessRef.current = onClaimSuccess;

  const stableTokenGetter = useCallback(() => getTokenRef.current?.(), []);

  // Keep Axios auth token getter synchronized synchronously before child effects run
  if (lastGetterStateRef.current !== Boolean(isSignedIn)) {
    lastGetterStateRef.current = Boolean(isSignedIn);
    setAuthTokenGetter(isSignedIn ? stableTokenGetter : null);
  }

  useEffect(() => {
    setAuthTokenGetter(isSignedIn ? stableTokenGetter : null);
  }, [isSignedIn, stableTokenGetter]);

  const refreshUserLinks = useCallback(async () => {
    if (!isSignedInRef.current) {
      setUserLinks([]);
      return [];
    }
    try {
      const res = await getUserLinks();
      if (res?.success && Array.isArray(res.links)) {
        setUserLinks(res.links);
        return res.links;
      }
    } catch (err) {
      console.error('Failed to load user links:', err);
    }
    return [];
  }, []);

  const refreshLimits = useCallback(async () => {
    try {
      const res = await getRateLimits();
      if (res?.success) {
        setRateLimits(res);
        return res;
      }
    } catch {
      // non-fatal
    }
    return null;
  }, []);

  // Auto-Sync & Cleanup Hook:
  // 1. On sign-in: claim all guest links + guest deviceId -> clear all guest local info -> load full dashboard links
  // 2. On sign-out / guest: clear userLinks and refresh per-device guest limits
  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    if (!isSignedIn || !user?.id) {
      syncedUserIdRef.current = null;
      setUserLinks([]);
      setIsLoadingLinks(false);
      refreshLimits();
      return () => {
        cancelled = true;
      };
    }

    const runSignedInSync = async () => {
      setIsLoadingLinks(true);

      // Step 1: Claim guest links & clear non-login client tracking info (once per sign-in session)
      if (syncedUserIdRef.current !== user.id) {
        syncedUserIdRef.current = user.id;

        let guestLinks = [];
        try {
          const stored = localStorage.getItem('lynq-recent');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              guestLinks = parsed;
            }
          }
        } catch {
          guestLinks = [];
        }

        const guestDeviceId = peekGuestDeviceId();

        if (guestLinks.length > 0 || guestDeviceId) {
          try {
            const res = await claimUserLinks(guestLinks, guestDeviceId);
            if (!cancelled && res?.success) {
              clearGuestLocalInfo();
              window.dispatchEvent(new CustomEvent('lynq-guest-cleared'));
              if (res.claimedCount > 0 && onClaimSuccessRef.current) {
                onClaimSuccessRef.current(res.claimedCount);
              }
            }
          } catch (err) {
            console.error('Failed to claim guest links:', err);
          }
        } else {
          // Ensure empty leftover local keys are removed
          clearGuestLocalInfo();
          window.dispatchEvent(new CustomEvent('lynq-guest-cleared'));
        }
      }

      // Step 2: Load all links belonging to the authenticated user (after claim completes)
      try {
        const res = await getUserLinks();
        if (!cancelled && res?.success && Array.isArray(res.links)) {
          setUserLinks(res.links);
        }
      } catch (err) {
        console.error('Failed to load user links:', err);
      } finally {
        if (!cancelled) {
          setIsLoadingLinks(false);
        }
      }

      // Step 3: Load per-login rate limit info
      if (!cancelled) {
        refreshLimits();
      }
    };

    runSignedInSync();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id, refreshLimits]);

  return (
    <AuthContext.Provider
      value={{
        isLoaded,
        isSignedIn,
        user,
        getToken,
        hasClerk: true,
        userLinks,
        setUserLinks,
        isLoadingLinks,
        refreshUserLinks,
        rateLimits,
        refreshLimits,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children, onClaimSuccess }) {
  const hasClerk = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  const [rateLimits, setRateLimits] = useState(null);

  const refreshLimits = useCallback(async () => {
    try {
      const res = await getRateLimits();
      if (res?.success) {
        setRateLimits(res);
        return res;
      }
    } catch {
      // non-fatal
    }
    return null;
  }, []);

  useEffect(() => {
    if (!hasClerk) {
      refreshLimits();
    }
  }, [hasClerk, refreshLimits]);

  if (!hasClerk) {
    return (
      <AuthContext.Provider
        value={{
          isLoaded: true,
          isSignedIn: false,
          user: null,
          getToken: async () => null,
          hasClerk: false,
          userLinks: [],
          setUserLinks: () => {},
          isLoadingLinks: false,
          refreshUserLinks: async () => [],
          rateLimits,
          refreshLimits,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <ClerkInnerAuthProvider onClaimSuccess={onClaimSuccess}>
      {children}
    </ClerkInnerAuthProvider>
  );
}

export const useLynqAuth = () => useContext(AuthContext);
