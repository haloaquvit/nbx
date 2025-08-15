import {
  createContext,
  useState,
  useEffect,
  useContext,
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

  // Fetch user profile dari Supabase
  const fetchUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
      console.log('[AuthContext] Fetching profile for user:', supabaseUser.id);
      
      const { data, error } = await supabase
        .from('employees_view') // atau 'profiles' kalau kamu pakai itu
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (error) {
        console.error('[AuthContext] Gagal ambil user profile:', error);
        setUser(null); // fallback agar tidak stuck
        return;
      }

      if (!data) {
        console.error('[AuthContext] User profile tidak ditemukan');
        setUser(null);
        return;
      }

      const employeeProfile: Employee = {
        id: data.id,
        name: data.full_name,
        username: data.username || data.full_name || data.email || '',
        email: data.email,
        role: data.role,
        phone: data.phone,
        address: data.address,
        status: data.status,
      };

      console.log('[AuthContext] Profile loaded:', employeeProfile);
      setUser(employeeProfile);
    } catch (err) {
      console.error('[AuthContext] Error fetch profile:', err);
      setUser(null); // fallback agar tidak stuck
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
        setSession(currentSession);

        if (currentSession?.user) {
          console.log('[AuthContext] User found, fetching profile...');
          await fetchUserProfile(currentSession.user);
        } else {
          console.log('[AuthContext] No user found');
          setUser(null);
        }
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

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        console.warn('[AuthContext] Auth initialization timeout, forcing isLoading to false');
        setIsLoading(false);
      }
    }, 5000); // 5 detik timeout

    initializeAuth();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      
      setSession(newSession);

      if (newSession?.user) {
        await fetchUserProfile(newSession.user);
      } else {
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Log untuk debugging
  useEffect(() => {
    console.log('[AuthContext] session:', session);
    console.log('[AuthContext] user:', user);
    console.log('[AuthContext] isLoading:', isLoading);
  }, [session, user, isLoading]);



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