import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

interface SupabaseAuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signInWithEmailPassword: (email: string, password: string) => Promise<any>;
  signUpWithEmailPassword: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<any>;
  signInWithOAuth: (provider: 'github' | 'google') => Promise<any>;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | undefined>(undefined);

export const SupabaseAuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error fetching session:', error);
      }
      setSession(session);
      setUser(session?.user || null);
      setIsLoading(false);
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      setIsLoading(false);
    });

    return () => {
      authListener?.unsubscribe();
    };
  }, []);

  const signInWithEmailPassword = async (email: string, password: string) => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) throw error;
    return data;
  };

  const signUpWithEmailPassword = async (email: string, password: string) => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setIsLoading(false);
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    setIsLoading(false);
    if (error) throw error;
  };

  const signInWithOAuth = async (provider: 'github' | 'google') => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + '/dashboard',
      },
    });
    setIsLoading(false);
    if (error) throw error;
    return data;
  };

  const value = {
    session,
    user,
    isLoading,
    signInWithEmailPassword,
    signUpWithEmailPassword,
    signOut,
    signInWithOAuth,
  };

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext);
  if (context === undefined) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
};
