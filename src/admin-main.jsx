import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase';
import AdminProducts from './AdminProducts';

function AdminAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadSession(nextSession) {
    setSession(nextSession);
    if (!nextSession) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,full_name,role')
      .eq('id', nextSession.user.id)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => loadSession(data.session));
    const { data: auth } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      loadSession(nextSession);
    });
    return () => auth.subscription.unsubscribe();
  }, []);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (loading) return <div className="admin-loading">Loading secure admin access…</div>;

  if (!session) {
    return (
      <main className="admin-auth-page">
        <form className="admin-auth-card" onSubmit={signIn}>
          <div className="admin-eyebrow">IJ LANGA CONSULTING</div>
          <h1>Secure Admin Portal</h1>
          <p>Sign in with the administrator account configured in Supabase Auth.</p>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          {error && <div className="admin-error">{error}</div>}
          {message && <div className="admin-message">{message}</div>}
          <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <a href="/">← Return to website</a>
        </form>
      </main>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <main className="admin-auth-page">
        <div className="admin-auth-card">
          <div className="admin-eyebrow">ACCESS CONTROL</div>
          <h1>Administrator access required</h1>
          <p>This authenticated account does not have the <strong>admin</strong> role. No catalogue management access has been granted.</p>
          {error && <div className="admin-error">{error}</div>}
          <button onClick={signOut}>Sign out</button>
          <a href="/">← Return to website</a>
        </div>
      </main>
    );
  }

  return <AdminProducts session={session} profile={profile} onSignOut={signOut} />;
}

createRoot(document.getElementById('root')).render(<AdminAuth />);
