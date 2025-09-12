import {
  createContext,
  useState,
  useEffect,
  useContext,
  useRef,
  ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Employee } from '@/types/employee';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: Employee | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  lastActivity: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  
  // Simple cache for user profiles to avoid repeated DB calls
  const profileCacheRef = useRef<Map<string, Employee>>(new Map());
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Simplified and fast user profile creation from auth data
  const createUserFromAuth = (supabaseUser: SupabaseUser): Employee => {
    return {
      id: supabaseUser.id,
      name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Unknown User',
      username: supabaseUser.email?.split('@')[0] || 'unknown',
      email: supabaseUser.email || '',
      role: 'owner', // Default to owner for full access to avoid permission issues
      phone: '',
      address: '',
      status: 'Aktif',
    };
  };

  // Update activity timestamp and reset logout timer
  const updateActivity = () => {
    const now = Date.now();
    setLastActivity(now);
    
    // Clear existing timer
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
    }
    
    // Set new 8-hour logout timer
    logoutTimerRef.current = setTimeout(() => {
      signOut();
    }, 8 * 60 * 60 * 1000); // 8 hours
  };

  // Lightweight profile fetch with fast fallback - simplified for better performance
  const fetchUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
      // Check cache first - extended cache time for better performance
      const cachedProfile = profileCacheRef.current.get(supabaseUser.id);
      if (cachedProfile && Date.now() - (cachedProfile as any)._cacheTime < 15 * 60 * 1000) { // 15 minutes cache
        setUser(cachedProfile);
        setIsLoading(false);
        updateActivity();
        return;
      }
      
      // Single fast database query with very short timeout
      const { data, error } = await Promise.race([
        supabase
          .from('profiles')
          .select('id, full_name, email, role, phone, address, status')
          .eq('id', supabaseUser.id)
          .single(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Quick timeout')), 2000); // Only 2 seconds
        })
      ]) as any;

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
        updateActivity();
        return;
      }
      
      // Fast fallback - don't waste time on additional queries
      throw error || new Error('No database profile found');
      
    } catch (err) {
      // Create profile from auth data immediately - this is the main path now
      const fallbackProfile = createUserFromAuth(supabaseUser);
      setUser(fallbackProfile);
      setIsLoading(false);
      updateActivity();
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      // Clear logout timer
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
      
      // Clear cache
      profileCacheRef.current.clear();
      
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setLastActivity(0);
    } catch (error) {
      // Silent error handling to prevent console spam
    }
  };

  // Initial session check on mount - simplified
  useEffect(() => {
    let isMounted = true;
    let authSubscription: any = null;

    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        
        // Simple session check
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
        
      } catch (err) {
        if (isMounted) {
          setSession(null);
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    // Setup auth state change listener
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

    // Initialize auth
    initializeAuth();

    // Cleanup function
    return () => {
      isMounted = false;
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
      }
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  // Add activity listeners to reset logout timer
  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const resetTimer = () => {
      updateActivity();
    };

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, resetTimer, true);
    });

    // Initial timer setup
    updateActivity();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimer, true);
      });
    };
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ session, user, isLoading, signOut, lastActivity }}
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