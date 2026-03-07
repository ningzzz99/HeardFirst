import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, HelpCircle, CheckCircle, Send, Loader2, RefreshCw, GraduationCap } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { generateReasons, generateActions, generateImage } from '../services/geminiService';
import { UserProfile, EmotionOption, EmotionLog, AISuggestion } from '../types';

const EMOTIONS: EmotionOption[] = [
  { id: 'happy', label: 'HAPPY', emoji: '😀', color: 'bg-[#E8F8F0] border-[#27AE60] text-[#27AE60]' },
  { id: 'sad', label: 'SAD', emoji: '😢', color: 'bg-[#EBF4FF] border-[#4A90E2] text-[#4A90E2]' },
  { id: 'angry', label: 'ANGRY', emoji: '😠', color: 'bg-[#FEE2E2] border-[#E74C3C] text-[#E74C3C]' },
  { id: 'confused', label: 'CONFUSED', emoji: '😕', color: 'bg-[#FEF5E7] border-[#F39C12] text-[#F39C12]' },
  { id: 'tired', label: 'TIRED', emoji: '😴', color: 'bg-[#F4F6F7] border-[#7F8C8D] text-[#7F8C8D]' },
  { id: 'hungry', label: 'HUNGRY', emoji: '🍽️', color: 'bg-[#F5EEF8] border-[#8E44AD] text-[#8E44AD]' },
];

interface StudentDashboardProps {
  user: UserProfile;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ user }) => {
  const [step, setStep] = useState<'emotion' | 'reason' | 'action' | 'status'>('emotion');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionOption | null>(null);
  const [reasons, setReasons] = useState<{ text: string; image: string }[]>([]);
  const [selectedReason, setSelectedReason] = useState<{ text: string; image: string } | null>(null);
  const [actions, setActions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentLogId, setCurrentLogId] = useState<string | null>(null);
  const [activeLog, setActiveLog] = useState<EmotionLog | null>(null);

  // Listen for active help requests
  useEffect(() => {
    const q = query(
      collection(db, 'emotion_logs'),
      where('student_id', '==', user.uid),
      where('resolved', '==', false),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const log = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as EmotionLog;
        setActiveLog(log);
        if (log.help_requested) {
          setStep('status');
        }
      } else {
        setActiveLog(null);
        if (step === 'status') setStep('emotion');
      }
    });

    return () => unsubscribe();
  }, [user.uid, step]);

  const handleEmotionSelect = async (emotion: EmotionOption) => {
    setSelectedEmotion(emotion);
    setLoading(true);
    setStep('reason');
    try {
      const texts = await generateReasons(emotion.label);
      const reasonsWithImages = await Promise.all(
        texts.map(async (text) => ({
          text,
          image: await generateImage(text)
        }))
      );
      setReasons(reasonsWithImages);
    } catch (error) {
      console.error('Error generating reasons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReasonSelect = async (reason: { text: string; image: string }) => {
    setSelectedReason(reason);
    setLoading(true);
    setStep('action');
    let newLogId = currentLogId;
    try {
      const logData = {
        student_id: user.uid,
        student_name: user.name,
        emotion: `${selectedEmotion!.emoji} ${selectedEmotion!.label}`,
        reason: reason.text,
        reason_prompt: reason.text,
        ai_suggestions: [],
        help_requested: false,
        resolved: false,
        timestamp: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'emotion_logs'), logData);
      newLogId = docRef.id;
      setCurrentLogId(docRef.id);
    } catch (error) {
      console.error('Error creating initial log:', error);
    }

    try {
      const texts = await generateActions(selectedEmotion!.label, reason.text);
      const actionsWithImages = await Promise.all(
        texts.map(async (text) => ({
          text,
          image: await generateImage(text)
        }))
      );
      setActions(actionsWithImages);

      if (newLogId) {
        await updateDoc(doc(db, 'emotion_logs', newLogId), {
          ai_suggestions: texts.map(t => ({ text: t, prompt: t }))
        });
      }
    } catch (error) {
      console.error('Error generating actions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestHelp = async () => {
    if (currentLogId) {
      await updateDoc(doc(db, 'emotion_logs', currentLogId), {
        help_requested: true
      });
      setStep('status');
    }
  };

  const handleFeelBetter = async () => {
    const logId = activeLog?.id || currentLogId;
    if (logId) {
      await updateDoc(doc(db, 'emotion_logs', logId), {
        resolved: true,
        help_requested: false,
        resolvedAt: serverTimestamp()
      });
      setStep('emotion');
      setSelectedEmotion(null);
      setSelectedReason(null);
      setReasons([]);
      setActions([]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <AnimatePresence mode="wait">
        {step === 'emotion' && (
          <motion.div
            key="emotion"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="text-center">
              <h2 className="text-4xl font-black text-[#2C3E50] mb-2">I feel...</h2>
              <p className="text-[#7F8C8D] font-medium">Tap how you feel</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {EMOTIONS.map((emotion) => (
                <button
                  key={emotion.id}
                  onClick={() => handleEmotionSelect(emotion)}
                  className={`flex flex-col items-center p-8 rounded-[40px] border-4 ${emotion.color} shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95`}
                >
                  <span className="text-7xl mb-4">{emotion.emoji}</span>
                  <span className="text-xl font-black tracking-tighter">{emotion.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'reason' && (
          <motion.div
            key="reason"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('emotion')} className="p-4 bg-white rounded-full shadow-md hover:bg-[#F0F4F8] transition-colors">
                <ArrowLeft className="w-6 h-6 text-[#2C3E50]" />
              </button>
              <div className="text-center flex-1">
                <h2 className="text-4xl font-black text-[#2C3E50] mb-2">WHY?</h2>
                <p className="text-[#7F8C8D] font-medium">Because...</p>
              </div>
              <div className="w-14" /> {/* Spacer */}
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-[#4A90E2] animate-spin mb-4" />
                <p className="text-[#7F8C8D] font-bold animate-pulse uppercase tracking-widest text-sm">Thinking...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {reasons.map((reason, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleReasonSelect(reason)}
                    className="flex flex-col items-center bg-white rounded-[24px] border border-[#E5E5E5] shadow-sm hover:shadow-md transition-all overflow-hidden"
                  >
                    <div className="w-full aspect-square bg-white flex items-center justify-center p-4">
                      <img src={reason.image} alt={reason.text} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    </div>
                    <div className="px-4 pb-6 pt-2 w-full">
                      <span className="text-lg font-bold text-black text-center block w-full">{reason.text}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {step === 'action' && (
          <motion.div
            key="action"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="space-y-8"
          >
            <div className="text-center">
              <h2 className="text-4xl font-black text-[#2C3E50] mb-2">I can...</h2>
              <p className="text-[#7F8C8D] font-medium">Try one of these</p>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-[#27AE60] animate-spin mb-4" />
                <p className="text-[#7F8C8D] font-bold animate-pulse uppercase tracking-widest text-sm">Finding ideas...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {actions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={handleFeelBetter}
                      className="flex flex-col items-center bg-white rounded-[24px] border border-[#E5E5E5] shadow-sm hover:shadow-md transition-all overflow-hidden"
                    >
                      <div className="w-full aspect-square bg-white flex items-center justify-center p-4">
                        <img src={action.image} alt={action.text} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                      </div>
                      <div className="px-4 pb-6 pt-2 w-full">
                        <h3 className="text-lg font-bold text-black text-center block w-full">{action.text}</h3>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col md:flex-row gap-4 justify-center pt-8">
                  <button
                    onClick={handleFeelBetter}
                    className="flex-1 flex items-center justify-center gap-3 bg-[#27AE60] text-white p-6 rounded-3xl text-2xl font-black shadow-lg hover:bg-[#219150] transition-all hover:scale-105"
                  >
                    <CheckCircle className="w-8 h-8" />
                    I feel better
                  </button>
                  <button
                    onClick={handleRequestHelp}
                    className="flex-1 flex items-center justify-center gap-3 bg-[#E74C3C] text-white p-6 rounded-3xl text-2xl font-black shadow-lg hover:bg-[#C0392B] transition-all hover:scale-105"
                  >
                    <GraduationCap className="w-8 h-8" />
                    Ask for help
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {step === 'status' && (
          <motion.div
            key="status"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 space-y-8"
          >
            <div className="w-32 h-32 bg-[#FEE2E2] rounded-full flex items-center justify-center border-4 border-[#E74C3C] animate-bounce">
              <HelpCircle className="w-16 h-16 text-[#E74C3C]" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-4xl font-black text-[#2C3E50] mb-4">Help is coming!</h2>
              <p className="text-xl text-[#7F8C8D] font-medium leading-relaxed">
                Teacher is coming soon!
              </p>
            </div>

            <div className="bg-white p-8 rounded-[40px] border-4 border-[#E5E5E5] w-full max-w-md shadow-lg">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-4xl">{activeLog?.emotion.split(' ')[0]}</span>
                <div>
                  <p className="text-sm font-bold text-[#7F8C8D] uppercase tracking-wider">I feel</p>
                  <p className="text-xl font-black text-[#2C3E50]">{activeLog?.emotion.split(' ')[1]}</p>
                </div>
              </div>
              <p className="text-[#7F8C8D] italic">"{activeLog?.reason}"</p>
            </div>

            <button
              onClick={handleFeelBetter}
              className="w-full max-w-md flex items-center justify-center gap-3 bg-[#27AE60] text-white p-6 rounded-3xl text-2xl font-black shadow-lg hover:bg-[#219150] transition-all hover:scale-105"
            >
              <CheckCircle className="w-8 h-8" />
              I FEEL BETTER
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
