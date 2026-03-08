import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, HelpCircle, CheckCircle, Send, Loader2, RefreshCw, GraduationCap } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { generateReasons, generateActions, generateImage, refineReason, getChatResponse } from '../services/geminiService';
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ user }) => {
  const [step, setStep] = useState<'emotion' | 'reason' | 'action' | 'status' | 'success' | 'others-input' | 'others-refine'>('emotion');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionOption | null>(null);
  const [reasons, setReasons] = useState<{ text: string; image: string }[]>([]);
  const [selectedReason, setSelectedReason] = useState<{ text: string; image: string } | null>(null);
  const [actions, setActions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentLogId, setCurrentLogId] = useState<string | null>(null);
  const [activeLog, setActiveLog] = useState<EmotionLog | null>(null);
  const [othersText, setOthersText] = useState('');
  const [refinedReasons, setRefinedReasons] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; parts: { text: string }[] }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Initialize chat greeting when entering status step
  useEffect(() => {
    if (step === 'status' && chatMessages.length === 0) {
      setChatMessages([
        { role: 'model', parts: [{ text: "Hello! 👋 I'm your AI Friend. I'm here to keep you company while we wait for your teacher. Would you like to hear a funny joke or a short story?" }] }
      ]);
    }
  }, [step]);

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
      const [texts] = await Promise.all([
        generateReasons(emotion.label),
        delay(2000)
      ]);
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
      const [texts] = await Promise.all([
        generateActions(selectedEmotion!.label, reason.text),
        delay(2000)
      ]);
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

  const handleOthersSubmit = async () => {
    if (!othersText.trim()) return;
    setLoading(true);
    setStep('others-refine');
    try {
      const [suggestions] = await Promise.all([
        refineReason(selectedEmotion!.label, othersText),
        delay(2000)
      ]);
      setRefinedReasons(suggestions);
    } catch (error) {
      console.error('Error refining reason:', error);
      setRefinedReasons([othersText]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefinedReasonSelect = async (reasonText: string) => {
    setLoading(true);
    const image = await generateImage(reasonText);
    handleReasonSelect({ text: reasonText, image });
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = { role: 'user' as const, parts: [{ text: chatInput }] };
    const newHistory = [...chatMessages, userMessage];

    setChatMessages(newHistory);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await getChatResponse(newHistory);
      setChatMessages([...newHistory, { role: 'model' as const, parts: [{ text: response }] }]);
    } catch (error) {
      console.error('Error in chat:', error);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleActionSelect = async (actionText: string) => {
    // First update the log to mark it resolved
    const logId = activeLog?.id || currentLogId;
    if (logId) {
      await updateDoc(doc(db, 'emotion_logs', logId), {
        resolved: true,
        help_requested: false,
        resolvedAt: serverTimestamp(),
        action_taken: actionText
      });
    }

    // Move to success screen
    setStep('success');

    // Automatically return to start after 3 seconds
    setTimeout(() => {
      setStep('emotion');
      setSelectedEmotion(null);
      setSelectedReason(null);
      setReasons([]);
      setActions([]);
    }, 3000);
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                {reasons.map((reason, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleReasonSelect(reason)}
                    className="flex flex-col items-center bg-white rounded-[24px] border border-[#E5E5E5] shadow-sm hover:shadow-md transition-all overflow-hidden h-full"
                  >
                    <div className="w-full aspect-square bg-[#F8FAFC] flex items-center justify-center p-6 border-b border-[#E5E5E5]">
                      <img src={reason.image} alt={reason.text} className="w-full h-full object-contain drop-shadow-sm" referrerPolicy="no-referrer" />
                    </div>
                    <div className="px-4 pb-6 pt-4 w-full flex-1 flex items-center justify-center min-h-[110px]">
                      <span className="text-xl font-bold text-[#2C3E50] text-center block w-full leading-tight">{reason.text}</span>
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => {
                    setOthersText('');
                    setStep('others-input');
                  }}
                  className="flex flex-col items-center bg-white rounded-[24px] border-4 border-dashed border-[#E5E5E5] shadow-sm hover:shadow-md transition-all overflow-hidden hover:border-[#4A90E2] group p-8 justify-center h-full min-h-[200px]"
                >
                  <div className="w-20 h-20 bg-[#F8FAFC] rounded-full flex items-center justify-center mb-4 group-hover:bg-[#EBF4FF] transition-colors">
                    <Send className="w-10 h-10 text-[#7F8C8D] group-hover:text-[#4A90E2]" />
                  </div>
                  <span className="text-xl font-black text-[#7F8C8D] group-hover:text-[#4A90E2]">Something else...</span>
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === 'others-input' && (
          <motion.div
            key="others-input"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('reason')} className="p-4 bg-white rounded-full shadow-md hover:bg-[#F0F4F8] transition-colors">
                <ArrowLeft className="w-6 h-6 text-[#2C3E50]" />
              </button>
              <div className="text-center flex-1">
                <h2 className="text-4xl font-black text-[#2C3E50] mb-2">Tell us more</h2>
                <p className="text-[#7F8C8D] font-medium">What happened?</p>
              </div>
              <div className="w-14" />
            </div>

            <div className="max-w-md mx-auto space-y-6">
              <textarea
                value={othersText}
                onChange={(e) => setOthersText(e.target.value)}
                placeholder="e.g. food, lost my bag, someone was loud..."
                className="w-full p-8 rounded-[32px] border-4 border-[#E5E5E5] text-2xl font-bold focus:border-[#4A90E2] focus:outline-none min-h-[150px] resize-none"
                autoFocus
              />
              <button
                onClick={handleOthersSubmit}
                disabled={!othersText.trim() || loading}
                className="w-full bg-[#4A90E2] text-white p-6 rounded-3xl text-2xl font-black shadow-lg hover:bg-[#357ABD] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Send className="w-8 h-8" />}
                Next
              </button>
            </div>
          </motion.div>
        )}

        {step === 'others-refine' && (
          <motion.div
            key="others-refine"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="text-center">
              <h2 className="text-4xl font-black text-[#2C3E50] mb-2">Is it one of these?</h2>
              <p className="text-[#7F8C8D] font-medium leading-tight italic">"{othersText}"</p>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 text-[#4A90E2] animate-spin mb-4" />
                <p className="text-[#7F8C8D] font-bold animate-pulse">Thinking...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                {refinedReasons.map((reason, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleRefinedReasonSelect(reason)}
                    className="p-8 bg-white rounded-[40px] border-4 border-[#4A90E2] shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 text-xl font-black text-[#2C3E50] text-center"
                  >
                    {reason}
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                  {actions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleActionSelect(action.text)}
                      className="flex flex-col items-center bg-white rounded-[24px] border border-[#E5E5E5] shadow-sm hover:shadow-md transition-all overflow-hidden h-full"
                    >
                      <div className="w-full aspect-square bg-[#F8FAFC] flex items-center justify-center p-6 border-b border-[#E5E5E5]">
                        <img src={action.image} alt={action.text} className="w-full h-full object-contain drop-shadow-sm" referrerPolicy="no-referrer" />
                      </div>
                      <div className="px-4 pb-6 pt-4 w-full flex-1 flex items-center justify-center min-h-[110px]">
                        <h3 className="text-xl font-bold text-[#2C3E50] text-center block w-full leading-tight">{action.text}</h3>
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
            className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start py-6 max-w-5xl mx-auto"
          >
            {/* Left Side: Status & Action */}
            <div className="space-y-8 flex flex-col items-center md:items-start text-center md:text-left">
              <div className="flex flex-col items-center md:items-start">
                <div className="w-24 h-24 bg-[#FEE2E2] rounded-full flex items-center justify-center border-4 border-[#E74C3C] animate-bounce mb-6">
                  <HelpCircle className="w-12 h-12 text-[#E74C3C]" />
                </div>
                <h2 className="text-5xl font-black text-[#2C3E50] mb-2 leading-tight">Help is coming!</h2>
                <p className="text-2xl text-[#7F8C8D] font-medium">Your teacher is on the way to help you.</p>
              </div>

              <div className="bg-white p-8 rounded-[40px] border-4 border-[#E5E5E5] w-full shadow-lg">
                <div className="flex items-center gap-4 mb-4 justify-center md:justify-start">
                  <span className="text-4xl">{activeLog?.emotion.split(' ')[0]}</span>
                  <div className="text-left">
                    <p className="text-sm font-bold text-[#7F8C8D] uppercase tracking-wider">I feel</p>
                    <p className="text-xl font-black text-[#2C3E50]">{activeLog?.emotion.split(' ')[1]}</p>
                  </div>
                </div>
                <p className="text-[#7F8C8D] italic text-lg">"{activeLog?.reason}"</p>
              </div>

              <button
                onClick={handleFeelBetter}
                className="w-full flex items-center justify-center gap-3 bg-[#27AE60] text-white p-8 rounded-3xl text-3xl font-black shadow-lg hover:bg-[#219150] transition-all hover:scale-105"
              >
                <CheckCircle className="w-10 h-10" />
                I FEEL BETTER
              </button>
            </div>

            {/* Right Side: Chatbox */}
            <div className="w-full bg-white rounded-[40px] border-4 border-[#E5E5E5] shadow-lg flex flex-col h-[600px] overflow-hidden">
              <div className="bg-[#4A90E2] p-6 text-white text-center font-black flex items-center justify-center gap-2 text-xl">
                <span className="text-3xl">✨</span> Your AI Friend
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="text-center py-16 px-6">
                    <p className="text-[#7F8C8D] font-bold text-2xl mb-4">Hello there! 👋</p>
                    <p className="text-xl text-[#95A5A6] leading-relaxed">I can tell you a joke or a story while we wait. What would you like?</p>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-5 rounded-3xl font-bold text-lg ${msg.role === 'user'
                      ? 'bg-[#EBF4FF] text-[#4A90E2] rounded-tr-none'
                      : 'bg-[#F4F6F7] text-[#2C3E50] rounded-tl-none border-2 border-[#E5E5E5]'
                      }`}>
                      {msg.parts[0].text}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#F4F6F7] p-5 rounded-3xl rounded-tl-none border-2 border-[#E5E5E5] flex gap-2">
                      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 bg-[#95A5A6] rounded-full" />
                      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-3 h-3 bg-[#95A5A6] rounded-full" />
                      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-3 h-3 bg-[#95A5A6] rounded-full" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 border-t-4 border-[#E5E5E5] flex gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendChatMessage()}
                  placeholder="Ask me something..."
                  className="flex-1 p-5 bg-[#F8FAFC] rounded-2xl border-2 border-[#E5E5E5] font-bold text-lg focus:border-[#4A90E2] focus:outline-none"
                />
                <button
                  onClick={handleSendChatMessage}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="bg-[#4A90E2] p-5 text-white rounded-2xl shadow-md hover:bg-[#357ABD] disabled:opacity-50 transition-all"
                >
                  <Send className="w-8 h-8" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="flex flex-col items-center justify-center py-20 space-y-8"
          >
            <div className="w-48 h-48 bg-[#E8F8F0] rounded-full flex items-center justify-center border-8 border-[#27AE60] animate-bounce shadow-2xl">
              <span className="text-8xl">⭐</span>
            </div>
            <div className="text-center max-w-md space-y-4">
              <h2 className="text-5xl font-black text-[#27AE60] tracking-tighter uppercase">Great Job!</h2>
              <p className="text-2xl text-[#2C3E50] font-bold leading-relaxed">
                I am so proud of you for trying that!
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
