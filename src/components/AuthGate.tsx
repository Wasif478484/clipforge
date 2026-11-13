import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseConfig } from '../lib/supabase';

interface Props {
  children: React.ReactNode;
}

export default function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Deployments without Supabase are local-first: nothing to sign in to.
  if (!supabaseConfig.configured) return <>{children}</>;
  // One-click local mode on configured deployments: skip the account entirely.
  if (localMode) return <>{children}</>;
  if (user) return <>{children}</>;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setMessage({ kind: 'error', text: 'Passwords do not match.' });
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setMessage({ kind: 'error', text: error.message });
      else if (!data.session) setMessage({ kind: 'success', text: 'Account created. Check your email to confirm your account, then sign in.' });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage({ kind: 'error', text: error.message });
    }
    setBusy(false);
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-heading">
          <div>
            <h1>{mode === 'signin' ? 'Sign in to ClipForge' : 'Create your ClipForge account'}</h1>
            <p>{mode === 'signin' ? 'Sign in to access cloud projects. Your local editor data remains on this device.' : 'Create an account to save and access projects across devices.'}</p>
          </div>
          <span className="auth-badge">Secure cloud access</span>
        </div>
        <form onSubmit={submit}>
          <label>Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {mode === 'signup' && <label>Confirm password<input type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>}
          {message && <p className={message.kind === 'error' ? 'auth-error' : 'auth-success'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
          <button className="btn" type="submit" disabled={busy}>{busy ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="auth-switch">
          {mode === 'signin' ? 'New to ClipForge?' : 'Already have an account?'}
          <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null); }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        <p className="auth-switch">
          Just exploring?
          <button type="button" onClick={() => setLocalMode(true)}>Continue without an account</button>
        </p>
        <p className="muted-note">Local mode keeps everything on this device. Cloud projects stay available after signing in.</p>
      </section>
    </main>
  );
}
