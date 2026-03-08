import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, GraduationCap, Users, ArrowRight, Search, Check, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { UserRole, UserProfile } from '../types';

interface LandingPageProps {
  onLogin: (user: UserProfile) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingNames, setFetchingNames] = useState(false);
  const [existingUsers, setExistingUsers] = useState<UserProfile[]>([]);
  const [step, setStep] = useState<'role' | 'name' | 'pickChild'>('role');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);

  useEffect(() => {
    if (selectedRole) {
      const fetchExistingNames = async () => {
        setFetchingNames(true);
        try {
          const q = query(collection(db, 'users'), where('role', '==', selectedRole));
          const querySnapshot = await getDocs(q);
          const users = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
          setExistingUsers(users);
        } catch (error) {
          console.error('Error fetching existing names:', error);
        } finally {
          setFetchingNames(false);
        }
      };
      fetchExistingNames();
    } else {
      setExistingUsers([]);
    }
  }, [selectedRole]);

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setStep('name');
  };

  const handleExistingUserSelect = (user: UserProfile) => {
    setName(user.name);
    // Directly login if it's an existing user (unless it's a parent who needs to pick children)
    if (selectedRole === 'parent') {
      handleNameSubmitInternal(user.name, user);
    } else {
      onLogin(user);
    }
  };

  const handleNameSubmitInternal = async (nameToSubmit: string, existingUser?: UserProfile) => {
    if (!nameToSubmit.trim() || !selectedRole) return;

    setLoading(true);
    try {
      let userProfile: UserProfile;

      if (existingUser) {
        userProfile = existingUser;
      } else {
        const q = query(
          collection(db, 'users'),
          where('name', '==', nameToSubmit.trim()),
          where('role', '==', selectedRole)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // Existing user found by name search
          const userDoc = querySnapshot.docs[0];
          userProfile = { uid: userDoc.id, ...userDoc.data() } as UserProfile;
        } else {
          // Create new user
          const newUid = `${selectedRole}_${Date.now()}`;
          const newUser: any = {
            uid: newUid,
            name: nameToSubmit.trim(),
            role: selectedRole,
            email: `${nameToSubmit.toLowerCase().replace(/\s/g, '')}@example.com`,
            createdAt: new Date().toISOString()
          };

          if (selectedRole === 'teacher') {
            newUser.class_id = `class_${newUid}`;
            // Create a default class for the teacher
            await setDoc(doc(db, 'classes', newUser.class_id), {
              id: newUser.class_id,
              name: `${nameToSubmit.trim()}'s Class`,
              teacher_id: newUid
            });
          }

          await setDoc(doc(db, 'users', newUid), newUser);
          userProfile = { uid: newUid, ...newUser };
        }
      }

      if (selectedRole === 'parent') {
        setCurrentUser(userProfile);
        // Fetch all students to pick from
        const studentQ = query(collection(db, 'users'), where('role', '==', 'student'));
        const studentSnapshot = await getDocs(studentQ);
        const studentList = studentSnapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
        setStudents(studentList);

        // Find already linked children
        const linkedChildren = studentList.filter(s => s.parent_id === userProfile.uid).map(s => s.uid);
        setSelectedChildren(linkedChildren);

        setStep('pickChild');
      } else {
        onLogin(userProfile);
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNameSubmitInternal(name);
  };

  const toggleChild = (studentId: string) => {
    setSelectedChildren(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleFinishParentLogin = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Update all students: link those selected, unlink those not selected (if they were linked to this parent)
      const updatePromises = students.map(async (student) => {
        const isSelected = selectedChildren.includes(student.uid);
        const wasLinked = student.parent_id === currentUser.uid;

        if (isSelected && !wasLinked) {
          await updateDoc(doc(db, 'users', student.uid), { parent_id: currentUser.uid });
        } else if (!isSelected && wasLinked) {
          await updateDoc(doc(db, 'users', student.uid), { parent_id: null });
        }
      });

      await Promise.all(updatePromises);
      onLogin(currentUser);
    } catch (error) {
      console.error('Error linking children:', error);
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    {
      id: 'student' as UserRole,
      title: 'Student',
      description: 'I am learning',
      icon: <User className="w-8 h-8 text-[#4A90E2]" />,
      color: 'bg-[#EBF4FF]',
      borderColor: 'border-[#4A90E2]',
      textColor: 'text-[#4A90E2]'
    },
    {
      id: 'teacher' as UserRole,
      title: 'Teacher',
      description: 'I am teaching',
      icon: <GraduationCap className="w-8 h-8 text-[#27AE60]" />,
      color: 'bg-[#E8F8F0]',
      borderColor: 'border-[#27AE60]',
      textColor: 'text-[#27AE60]'
    },
    {
      id: 'parent' as UserRole,
      title: 'Parent',
      description: 'I am a caregiver',
      icon: <Users className="w-8 h-8 text-[#E67E22]" />,
      color: 'bg-[#FEF5E7]',
      borderColor: 'border-[#E67E22]',
      textColor: 'text-[#E67E22]'
    }
  ];

  return (
    <div className="min-h-[90vh] flex items-center justify-center p-4 md:p-8 lg:p-12">
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">

        {/* Left Side: Branding */}
        <div className="text-center lg:text-left space-y-8 order-2 lg:order-1">
          <div className="space-y-8">
            <div className="flex justify-center">
              <img src="/logo.png" alt="Heard First Logo" className="w-60 h-60 rounded-3xl shadow-2xl" />
            </div>
            <div className="space-y-2">
              <h1 className="text-7xl md:text-8xl font-black text-[#2C3E50] tracking-tighter leading-none">
                Heard<span className="text-[#4A90E2]">First</span>
              </h1>
              <p className="text-3xl md:text-4xl font-medium text-[#4A90E2] tracking-tight leading-tight">
                Every child has a voice
              </p>
            </div>
          </div>
          <p className="text-2xl text-[#7F8C8D] font-medium leading-[1.6] pt-8 border-t-4 border-[#F0F4F8] max-w-xl mx-auto lg:mx-0">
            Helps non-verbal and autistic children communicate their emotions and needs in school bridging students, teachers, and parents.
          </p>
        </div>

        {/* Right Side: Interactive Content */}
        <div className="bg-white/50 backdrop-blur-sm p-2 md:p-8 rounded-[60px] border-4 border-[#F0F4F8] shadow-sm order-1 lg:order-2">
          <AnimatePresence mode="wait">
            {step === 'role' && (
              <motion.div
                key="role"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="w-full space-y-10 py-4"
              >
                <div className="text-center">
                  <h2 className="text-4xl font-black text-[#2C3E50] mb-3 tracking-tighter">I am a...</h2>
                  <p className="text-lg text-[#7F8C8D] font-bold uppercase tracking-widest">Select your role</p>
                </div>

                <div className="space-y-5">
                  {roles.map((role, index) => (
                    <motion.button
                      key={role.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleRoleSelect(role.id)}
                      className={`w-full flex items-center p-6 rounded-[32px] border-4 transition-all group relative overflow-hidden active:scale-95 ${role.borderColor
                        } ${role.color} shadow-lg hover:shadow-2xl hover:-translate-y-1`}
                    >
                      <div className="bg-white p-4 rounded-2xl shadow-sm mr-6 group-hover:scale-110 transition-transform">
                        {role.icon}
                      </div>
                      <div className="text-left flex-1">
                        <h3 className={`text-2xl font-black ${role.textColor}`}>{role.title}</h3>
                        <p className="text-[#7F8C8D] font-bold text-sm tracking-tight">{role.description}</p>
                      </div>
                      <div className={`p-2 rounded-full bg-white/50 ${role.textColor} group-hover:translate-x-2 transition-transform`}>
                        <ArrowRight className="w-6 h-6" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 'name' && (
              <motion.div
                key="name"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                className="w-full space-y-8 py-4"
              >
                <div className="text-center">
                  <button onClick={() => setStep('role')} className="text-[#7F8C8D] font-black hover:text-[#4A90E2] mb-6 flex items-center justify-center gap-2 mx-auto uppercase tracking-widest text-sm transition-colors group">
                    <ArrowRight className="w-5 h-5 rotate-180 group-hover:-translate-x-1 transition-transform" /> Back to roles
                  </button>
                  <h2 className="text-4xl font-black text-[#2C3E50] mb-2 tracking-tighter">Welcome!</h2>
                  <p className="text-xl text-[#7F8C8D] font-bold">What is your name?</p>
                </div>

                <form onSubmit={handleNameSubmit} className="space-y-6">
                  <div className="relative">
                    <input
                      autoFocus
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Charlie"
                      className="w-full p-8 text-3xl font-black rounded-[32px] border-4 border-[#F0F4F8] focus:border-[#4A90E2] focus:bg-white outline-none transition-all shadow-inner bg-[#F9FAFB] text-[#2C3E50]"
                    />
                  </div>

                  {fetchingNames ? (
                    <div className="flex items-center justify-center gap-3 py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-[#4A90E2]" />
                      <p className="text-sm font-black text-[#7F8C8D] uppercase tracking-widest">Finding profiles...</p>
                    </div>
                  ) : existingUsers.length > 0 && (
                    <div className="space-y-4">
                      <p className="text-[#7F8C8D] font-black text-xs uppercase tracking-[0.2em] text-center mb-4">Saved Profiles</p>
                      <div className="flex flex-wrap gap-3 justify-center">
                        {existingUsers.map((user) => (
                          <button
                            key={user.uid}
                            type="button"
                            onClick={() => handleExistingUserSelect(user)}
                            className="px-6 py-4 bg-white border-2 border-[#F0F4F8] rounded-2xl font-black text-[#2C3E50] hover:border-[#4A90E2] hover:bg-[#EBF4FF] transition-all shadow-md flex items-center gap-3"
                          >
                            <div className="w-8 h-8 rounded-full bg-[#F0F4F8] flex items-center justify-center text-sm">👤</div>
                            {user.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    disabled={loading || !name.trim()}
                    type="submit"
                    className="w-full flex items-center justify-center gap-4 bg-[#4A90E2] text-white p-8 rounded-[32px] text-3xl font-black shadow-xl hover:bg-[#357ABD] transition-all disabled:opacity-50 active:scale-95"
                  >
                    {loading ? <Loader2 className="w-10 h-10 animate-spin" /> : (
                      <>
                        CONTINUE
                        <ArrowRight className="w-8 h-8" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'pickChild' && (
              <motion.div
                key="pickChild"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full space-y-8 py-4"
              >
                <div className="text-center">
                  <h2 className="text-4xl font-black text-[#2C3E50] mb-2 tracking-tighter">Family Link</h2>
                  <p className="text-[#7F8C8D] font-bold text-lg">Who are your children?</p>
                </div>

                <div className="grid grid-cols-1 gap-4 max-h-[400px] overflow-y-auto p-2 pr-4 custom-scrollbar">
                  {students.length > 0 ? (
                    students.map((student) => {
                      const isSelected = selectedChildren.includes(student.uid);
                      return (
                        <button
                          key={student.uid}
                          onClick={() => toggleChild(student.uid)}
                          className={`flex items-center p-6 rounded-[28px] border-4 transition-all group shadow-md active:scale-95 ${isSelected
                            ? 'border-[#4A90E2] bg-[#EBF4FF]'
                            : 'border-[#F4F6F7] bg-white hover:border-[#D1D9E6]'
                            }`}
                        >
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl mr-5 transition-colors ${isSelected ? 'bg-white shadow-inner' : 'bg-[#F4F6F7]'
                            }`}>
                            👤
                          </div>
                          <span className={`text-2xl font-black ${isSelected ? 'text-[#4A90E2]' : 'text-[#2C3E50]'}`}>
                            {student.name}
                          </span>
                          <div className={`ml-auto w-10 h-10 rounded-full border-4 flex items-center justify-center transition-all ${isSelected ? 'bg-[#4A90E2] border-[#4A90E2]' : 'border-[#D1D9E6]'
                            }`}>
                            {isSelected && <Check className="w-6 h-6 text-white" />}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-center py-16 bg-[#F9FAFB] rounded-[40px] border-4 border-dashed border-[#F0F4F8]">
                      <p className="text-[#7F8C8D] font-black text-xl mb-2">No students yet!</p>
                      <p className="text-sm text-[#95A5A6] font-bold">Students must join before you can link them.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-4">
                  <button
                    disabled={loading}
                    onClick={handleFinishParentLogin}
                    className="w-full flex items-center justify-center gap-4 bg-[#4A90E2] text-white p-8 rounded-[32px] text-3xl font-black shadow-xl hover:bg-[#357ABD] transition-all disabled:opacity-50 active:scale-95"
                  >
                    {loading ? <Loader2 className="w-10 h-10 animate-spin" /> : 'SAVE & FINISH'}
                  </button>

                  <button
                    onClick={() => onLogin(currentUser!)}
                    className="w-full p-4 text-[#7F8C8D] font-black hover:text-[#2C3E50] transition-colors text-lg uppercase tracking-widest"
                  >
                    Skip for now
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};
