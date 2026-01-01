import {
  createContext,
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { supabase, isPostgRESTMode } from '@/integrations/supabase/client';
import { postgrestAuth } from '@/integrations/supabase/postgrestAuth';
import { Employee } from '@/types/employee';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';

// Idle timeout configuration (in milliseconds)
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const IDLE_WARNING_MS = 55 * 60 * 1000; // Warning at 55 minutes (5 minutes before logout)
const PIN_VALIDATION_INTERVAL_MS = 3 * 60 * 1000; // PIN validation every 3 minutes of idle for owner

interface AuthContextType {
  session: Session | null;
  user: Employee | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  idleWarning: boolean; // Show warning before auto logout
  resetIdleTimer: () => void; // Manual reset for user activity
  pinRequired: boolean; // True when owner needs to enter PIN
  validatePin: (pin: string) => Promise<boolean>; // Validate owner PIN
  dismissPinDialog: () => void; // Dismiss PIN dialog after successful validation
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [idleWarning, setIdleWarning] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [ownerPin, setOwnerPin] = useState<string | null>(null);

  // Simple cache for user profiles to avoid repeated DB calls
  const profileCacheRef = useRef<Map<string, Employee>>(new Map());

  // Idle timer refs
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pinValidationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Simplified and fast user profile creation from auth data
  const createUserFromAuth = (authUser: any): Employee => {
    return {
      id: authUser.id,
      name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Unknown User',
      username: authUser.email?.split('@')[0] || 'unknown',
      email: authUser.email || '',
      role: authUser.role || authUser.app_metadata?.role || 'owner',
      phone: '',
      address: '',
      status: 'Aktif',
    };
  };

  // Lightweight profile fetch with fast fallback - simplified for better performance
  const fetchUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
      // Check cache first - extended cache time for better performance
      const cachedProfile = profileCacheRef.current.get(supabaseUser.id);
      if (cachedProfile && Date.now() - (cachedProfile as any)._cacheTime < 15 * 60 * 1000) { // 15 minutes cache
        setUser(cachedProfile);
        setIsLoading(false);
        return;
      }

      // Single fast database query with very short timeout
      // Use .order('id').limit(1) instead of .single() because our client forces Accept: application/json
      const { data: dataRaw, error } = await Promise.race([
        supabase
          .from('profiles')
          .select('id, full_name, email, role, phone, address, status')
          .eq('id', supabaseUser.id)
          .order('id').limit(1),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Quick timeout')), 2000); // Only 2 seconds
        })
      ]) as any;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;

      if (data && !error) {
        // Success - use database profile
        const employeeProfile: Employee = {
          id: data.id,
          name: data.full_name || supabaseUser.email?.split('@')[0] || 'Unknown User',
          username: supabaseUser.email?.split('@')[0] || 'unknown',
          email: data.email || supabaseUser.email || '',
          role: data.role || 'owner',
          phone: data.phone || '',
          address: data.address || '',
          status: data.status || 'Aktif',
        };

        // Cache the profile
        const profileWithCache = { ...employeeProfile, _cacheTime: Date.now() } as any;
        profileCacheRef.current.set(supabaseUser.id, profileWithCache);

        setUser(employeeProfile);
        setIsLoading(false);
        return;
      }

      // Fast fallback - don't waste time on additional queries
      throw error || new Error('No database profile found');

    } catch (err) {
      // Create profile from auth data immediately - this is the main path now
      const fallbackProfile = createUserFromAuth(supabaseUser);
      setUser(fallbackProfile);
      setIsLoading(false);
    }
  };

  // Sign out
  const signOut = useCallback(async () => {
    try {
      // Clear all timers
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (pinValidationTimerRef.current) clearTimeout(pinValidationTimerRef.current);
      setIdleWarning(false);
      setPinRequired(false);

      // Clear cache
      profileCacheRef.current.clear();

      if (isPostgRESTMode) {
        await postgrestAuth.signOut();
      } else {
        await supabase.auth.signOut();
      }
      setSession(null);
      setUser(null);
    } catch (error) {
      // Silent error handling to prevent console spam
    }
  }, []);

  // Validate owner PIN
  const validatePin = useCallback(async (pin: string): Promise<boolean> => {
    if (!ownerPin) return true; // No PIN set, always valid
    const isValid = pin === ownerPin;
    if (isValid) {
      setPinRequired(false);
      lastActivityRef.current = Date.now(); // Reset activity timer

      // Mark this session as validated (survives page refresh within same tab)
      const sessionStartKey = 'pin_validated_session';
      const currentSessionId = session?.access_token?.substring(0, 20) || session?.user?.id;
      if (currentSessionId) {
        sessionStorage.setItem(sessionStartKey, currentSessionId);
      }
    }
    return isValid;
  }, [ownerPin, session]);

  // Dismiss PIN dialog
  const dismissPinDialog = useCallback(() => {
    setPinRequired(false);
    lastActivityRef.current = Date.now();
  }, []);

  // Fetch owner PIN from company_settings
  const fetchOwnerPin = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('company_settings')
        .select('value')
        .eq('key', 'owner_pin')
        .limit(1);
      const setting = Array.isArray(data) ? data[0] : data;
      if (setting?.value) {
        setOwnerPin(setting.value);
      } else {
        setOwnerPin(null);
      }
    } catch (error) {
      console.error('Failed to fetch owner PIN:', error);
      setOwnerPin(null);
    }
  }, []);

  // Reset idle timer - called on user activity
  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleWarning(false);

    // Clear existing timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (pinValidationTimerRef.current) clearTimeout(pinValidationTimerRef.current);

    // Only set timers if user is logged in
    if (!session) return;

    // Set warning timer (5 minutes before logout)
    warningTimerRef.current = setTimeout(() => {
      setIdleWarning(true);
      console.log('⚠️ Idle warning: akan logout dalam 5 menit karena tidak ada aktivitas');
    }, IDLE_WARNING_MS);

    // Set logout timer
    idleTimerRef.current = setTimeout(() => {
      console.log('🔒 Auto logout karena idle 1 jam');
      signOut();
    }, IDLE_TIMEOUT_MS);

    // Set PIN validation timer for owner (3 minutes of idle)
    if (user?.role === 'owner' && ownerPin) {
      pinValidationTimerRef.current = setTimeout(() => {
        console.log('🔐 PIN validation required for owner after 3 minutes idle');
        setPinRequired(true);
      }, PIN_VALIDATION_INTERVAL_MS);
    }
  }, [session, signOut, user?.role, ownerPin]);

  // Setup idle detection listeners
  useEffect(() => {
    if (!session) return;

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      // Throttle activity detection to avoid too many resets
      const now = Date.now();
      if (now - lastActivityRef.current > 1000) { // Only reset if more than 1 second since last activity
        resetIdleTimer();
      }
    };

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Initialize timer
    resetIdleTimer();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (pinValidationTimerRef.current) clearTimeout(pinValidationTimerRef.current);
    };
  }, [session, resetIdleTimer]);

  // Fetch owner PIN when user logs in as owner
  useEffect(() => {
    if (!session || !user) return;

    // Only fetch PIN for owner role
    if (user.role === 'owner') {
      fetchOwnerPin();
    }
  }, [session, user, fetchOwnerPin]);

  // Trigger PIN validation on page load/refresh for owner with PIN
  useEffect(() => {
    if (!session || !user || user.role !== 'owner' || !ownerPin) return;

    // Check if this is a fresh page load (not just a state update)
    const sessionStartKey = 'pin_validated_session';
    const currentSessionId = session.access_token?.substring(0, 20) || session.user?.id;
    const lastValidatedSession = sessionStorage.getItem(sessionStartKey);

    if (lastValidatedSession !== currentSessionId) {
      // New session or page refresh - require PIN validation
      setPinRequired(true);
    }
  }, [session, user, ownerPin]);

  // Initial session check on mount - simplified
  useEffect(() => {
    let isMounted = true;
    let authSubscription: any = null;

    const initializeAuth = async () => {
      try {
        setIsLoading(true);

        if (isPostgRESTMode) {
          // PostgREST mode - use custom auth
          const { data } = await postgrestAuth.getSession();

          if (!isMounted) return;

          const currentSession = data?.session ?? null;
          setSession(currentSession as any);

          if (currentSession?.user) {
            const userProfile = createUserFromAuth(currentSession.user);
            setUser(userProfile);
          } else {
            setUser(null);
          }
          setIsLoading(false);
        } else {
          // Supabase mode - use Supabase auth
          const { data, error } = await supabase.auth.getSession();

          if (!isMounted) return;

          if (error) {
            setSession(null);
            setUser(null);
            setIsLoading(false);
            return;
          }

          const currentSession = data?.session ?? null;
          setSession(currentSession);

          if (currentSession?.user) {
            await fetchUserProfile(currentSession.user);
          } else {
            setUser(null);
            setIsLoading(false);
          }
        }

      } catch (err) {
        if (isMounted) {
          setSession(null);
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    // Setup auth state change listener
    if (isPostgRESTMode) {
      // PostgREST mode
      const { data: { subscription } } = postgrestAuth.onAuthStateChange(async (event, newSession) => {
        if (!isMounted) return;

        setSession(newSession as any);

        if (newSession?.user) {
          const userProfile = createUserFromAuth(newSession.user);
          setUser(userProfile);
        } else {
          setUser(null);
        }
        setIsLoading(false);
      });
      authSubscription = subscription;
    } else {
      // Supabase mode
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (!isMounted) return;

        setSession(newSession);

        if (newSession?.user) {
          await fetchUserProfile(newSession.user);
        } else {
          setUser(null);
          setIsLoading(false);
        }
      });
      authSubscription = subscription;
    }

    // Initialize auth
    initializeAuth();

    // Cleanup function
    return () => {
      isMounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user, isLoading, signOut, idleWarning, resetIdleTimer, pinRequired, validatePin, dismissPinDialog }}
    >
      {children}
    </AuthContext.Provider>
  );
};

const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

export { useAuthContext };
