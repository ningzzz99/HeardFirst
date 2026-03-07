import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Layout } from './components/Layout';
import { LandingPage } from './components/LandingPage';
import { StudentDashboard } from './components/StudentDashboard';
import { TeacherDashboard } from './components/TeacherDashboard';
import { ParentDashboard } from './components/ParentDashboard';
import { UserProfile, UserRole } from './types';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-6">
          <div className="bg-white p-12 rounded-[40px] border-4 border-[#E74C3C] shadow-2xl max-w-lg w-full text-center">
            <div className="w-24 h-24 bg-[#FEE2E2] rounded-full flex items-center justify-center mx-auto mb-8">
              <AlertTriangle className="w-12 h-12 text-[#E74C3C]" />
            </div>
            <h2 className="text-4xl font-black text-[#2C3E50] mb-4 tracking-tighter">Oops! Something went wrong</h2>
            <p className="text-[#7F8C8D] font-medium mb-8 leading-relaxed">
              We've encountered an unexpected error. Don't worry, your data is safe.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-3 bg-[#4A90E2] text-white p-6 rounded-3xl text-2xl font-black shadow-lg hover:bg-[#357ABD] transition-all active:scale-95"
            >
              <RefreshCw className="w-6 h-6" />
              RELOAD APP
            </button>
            <pre className="mt-8 p-4 bg-[#F9FAFB] rounded-2xl text-left text-xs text-[#7F8C8D] overflow-auto max-h-32 border border-[#E5E5E5]">
              {JSON.stringify(this.state.error, null, 2)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('bridge_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      // Keep profile synced with Firestore
      const unsubscribe = onSnapshot(doc(db, 'users', profile.uid), (snapshot) => {
        if (snapshot.exists()) {
          const updatedProfile = { uid: snapshot.id, ...snapshot.data() } as UserProfile;
          setProfile(updatedProfile);
          localStorage.setItem('bridge_user', JSON.stringify(updatedProfile));
        }
      });
      return () => unsubscribe();
    }
  }, [profile?.uid]);

  const handleLogin = (user: UserProfile) => {
    setProfile(user);
    localStorage.setItem('bridge_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setProfile(null);
    localStorage.removeItem('bridge_user');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center">
        <div className="w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-8 animate-bounce border-2 border-[#E5E5E5]">
          <div className="w-12 h-12 bg-[#4A90E2] rounded-lg flex items-center justify-center text-white text-3xl font-black">B</div>
        </div>
        <Loader2 className="w-12 h-12 text-[#4A90E2] animate-spin mb-4" />
        <p className="text-[#7F8C8D] font-black uppercase tracking-widest text-sm">Initializing Bridge...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Layout user={profile} onLogout={handleLogout}>
        {!profile ? (
          <LandingPage onLogin={handleLogin} />
        ) : (
          <>
            {profile.role === 'student' && <StudentDashboard user={profile} />}
            {profile.role === 'teacher' && <TeacherDashboard user={profile} />}
            {profile.role === 'parent' && <ParentDashboard user={profile} />}
          </>
        )}
      </Layout>
    </ErrorBoundary>
  );
}
