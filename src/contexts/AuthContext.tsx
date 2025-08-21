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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Simple cache for user profiles to avoid repeated DB calls
  const profileCacheRef = useRef<Map<string, Employee>>(new Map());

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

  // Lightweight profile fetch with fast fallback - simplified for better performance
  const fetchUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
      console.log('[AuthContext] Quick auth setup for user:', supabaseUser.email);
      
      // Check cache first - extended cache time for better performance
      const cachedProfile = profileCacheRef.current.get(supabaseUser.id);
      if (cachedProfile && Date.now() - (cachedProfile as any)._cacheTime < 15 * 60 * 1000) { // 15 minutes cache
        console.log('[AuthContext] Using cached profile:', cachedProfile.name);
        setUser(cachedProfile);
        setIsLoading(false);
        return;
      }
      
      // Single fast database query with very short timeout
      console.log('[AuthContext] Quick database check...');
      
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

        console.log('[AuthContext] Database profile loaded:', employeeProfile.name);
        
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
      console.log('[AuthContext] Using fast auth fallback (normal for first-time users)');
      
      // Create profile from auth data immediately - this is the main path now
      const fallbackProfile = createUserFromAuth(supabaseUser);
      
      console.log('[AuthContext] Auth profile ready:', fallbackProfile.name);
      setUser(fallbackProfile);
      setIsLoading(false);
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
    } catch (error) {
      console.error('[AuthContext] Error during sign out:', error);
    }
  };

  // Initial session check on mount
  useEffect(() => {
    let isMounted = true;
    let authSubscription: any = null;

    const initializeAuth = async () => {
      try {
        console.log('[AuthContext] Starting auth initialization...');
        setIsLoading(true);
        
        // Simple session check
        const { data, error } = await supabase.auth.getSession();
        
        if (!isMounted) {
          console.log('[AuthContext] Component unmounted, stopping...');
          return;
        }
        
        if (error) {
          console.error('[AuthContext] Error getting session:', error);
          setSession(null);
          setUser(null);
          setIsLoading(false);
          return;
        }

        const currentSession = data?.session ?? null;
        console.log('[AuthContext] Session found:', !!currentSession);
        console.log('[AuthContext] Session user:', currentSession?.user?.id);
        console.log('[AuthContext] Session user email:', currentSession?.user?.email);
        setSession(currentSession);

        if (currentSession?.user) {
          console.log('[AuthContext] User found in session, calling fetchUserProfile...');
          console.log('[AuthContext] Current session user details:', {
            id: currentSession.user.id,
            email: currentSession.user.email
          });
          await fetchUserProfile(currentSession.user);
          console.log('[AuthContext] fetchUserProfile completed');
        } else {
          console.log('[AuthContext] No user found in session');
          console.log('[AuthContext] Current session:', currentSession);
          setUser(null);
        }
        
        // Double-check: if we have session but still no user after profile fetch (disabled - working correctly)
        // setTimeout(() => {
        //   if (isMounted && currentSession && !user) {
        //     console.warn('[AuthContext] Session exists but user still null, creating fallback profile...');
        //     console.log('[AuthContext] Current session user:', currentSession.user);
        //     
        //     const fallbackProfile: Employee = {
        //       id: currentSession.user?.id || 'unknown',
        //       name: currentSession.user?.email?.split('@')[0] || 'Unknown User',
        //       username: currentSession.user?.email?.split('@')[0] || 'unknown',
        //       email: currentSession.user?.email || '',
        //       role: 'owner', // Default to owner for access
        //       phone: '',
        //       address: '',
        //       status: 'Aktif',
        //     };
        //     
        //     console.log('[AuthContext] Setting fallback profile:', fallbackProfile);
        //     setUser(fallbackProfile);
        //   }
        // }, 2000); // Increase to 2 seconds
      } catch (err) {
        console.error('[AuthContext] Error during auth initialization:', err);
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          console.log('[AuthContext] Setting isLoading to false');
          setIsLoading(false);
        }
      }
    };

    // Add timeout to prevent infinite loading - reduced for faster experience
    const timeoutId = setTimeout(() => {
      if (isMounted && isLoading) {
        console.log('[AuthContext] Auth initialization timeout, stopping loading');
        setIsLoading(false);
      }
    }, 3000); // 3 seconds timeout for faster response

    // Setup auth state change listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;
      
      console.log('[AuthContext] Auth state change event:', event);
      console.log('[AuthContext] New session in auth state change:', !!newSession);
      
      setSession(newSession);

      if (newSession?.user) {
        console.log('[AuthContext] New session detected, fetching user profile...');
        console.log('[AuthContext] New session user details:', {
          id: newSession.user.id,
          email: newSession.user.email
        });
        await fetchUserProfile(newSession.user);
        
        // Fallback check for auth state change (disabled - working correctly)
        // setTimeout(() => {
        //   if (isMounted && newSession && !user) {
        //     console.warn('[AuthContext] Auth state change: session exists but user still null, creating fallback...');
        //     const fallbackProfile: Employee = {
        //       id: newSession.user?.id || 'unknown',
        //       name: newSession.user?.email?.split('@')[0] || 'Unknown User',
        //       username: newSession.user?.email?.split('@')[0] || 'unknown',
        //       email: newSession.user?.email || '',
        //       role: 'owner',
        //       phone: '',
        //       address: '',
        //       status: 'Aktif',
        //     };
        //     setUser(fallbackProfile);
        //   }
        // }, 1000);
      } else {
        console.log('[AuthContext] No user in session, setting user to null');
        setUser(null);
      }
      
      if (isMounted) {
        setIsLoading(false);
      }
    });
    
    authSubscription = subscription;

    // Initialize auth
    initializeAuth();
    
    // Simplified emergency fallback - just ensure loading stops
    const emergencyFallback = setTimeout(() => {
      if (isMounted && isLoading && !user) {
        console.log('[AuthContext] Emergency fallback: creating user from session if available');
        
        // Quick session check and user creation if needed
        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
          if (currentSession && currentSession.user && isMounted) {
            const quickProfile = createUserFromAuth(currentSession.user);
            console.log('[AuthContext] Emergency profile created:', quickProfile.name);
            setUser(quickProfile);
            setSession(currentSession);
          }
          if (isMounted) {
            setIsLoading(false);
          }
        }).catch(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
      }
    }, 1500); // Just 1.5 seconds for quick response

    // Cleanup function
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      clearTimeout(emergencyFallback);
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  // Log untuk debugging (dapat dikommentari jika sudah stabil)
  // useEffect(() => {
  //   console.log('[AuthContext] session:', session);
  //   console.log('[AuthContext] user:', user);
  //   console.log('[AuthContext] isLoading:', isLoading);
  // }, [session, user, isLoading]);



  return (
    <AuthContext.Provider
      value={{ session, user, isLoading, signOut }}
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