import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, FileText, Download, ChevronDown, ChevronUp, Clock, MessageSquare, Loader2, Heart, ArrowLeft, Send } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { UserProfile, EmotionLog } from '../types';
import { generateDailySummary } from '../services/geminiService';
import { AIImage } from './AIImage';

interface ParentDashboardProps {
  user: UserProfile;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({ user }) => {
  const [children, setChildren] = useState<UserProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<EmotionLog[]>([]);
  const [classUpdates, setClassUpdates] = useState<any[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [showTeacherChat, setShowTeacherChat] = useState(false);
  const [teacherMessages, setTeacherMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [teacherMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChild?.class_id) return;

    setSendingMessage(true);
    try {
      await addDoc(collection(db, 'parent_messages'), {
        parent_id: user.uid,
        child_id: selectedChild.uid,
        class_id: selectedChild.class_id,
        message: newMessage.trim(),
        sender_name: user.name,
        timestamp: serverTimestamp()
      });
      
      // Also add to class_updates so teacher can see it
      await addDoc(collection(db, 'class_updates'), {
        parent_id: user.uid,
        child_id: selectedChild.uid,
        class_id: selectedChild.class_id,
        message: `From ${user.name} (${selectedChild.name}'s parent): ${newMessage.trim()}`,
        timestamp: serverTimestamp()
      });
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    // Find all children (students with parent_id == user.uid)
    const qChildren = query(collection(db, 'users'), where('parent_id', '==', user.uid));
    const unsubscribeChildren = onSnapshot(qChildren, (snapshot) => {
      const childrenList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setChildren(childrenList);
      setLoading(false);
    });

    return () => unsubscribeChildren();
  }, [user.uid]);

  useEffect(() => {
    if (!selectedChild) return;

    setLoading(true);
    setSummary(null);

    // Fetch logs
    const qLogs = query(collection(db, 'emotion_logs'), where('student_id', '==', selectedChild.uid), orderBy('timestamp', 'desc'));
    const unsubscribeLogs = onSnapshot(qLogs, async (logSnapshot) => {
      const logList = logSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmotionLog));
      setLogs(logList);

      // Generate summary if logs exist
      if (logList.length > 0) {
        try {
          const text = await generateDailySummary(selectedChild.name, logList);
          setSummary(text);
        } catch (error) {
          console.error('Error generating summary:', error);
        }
      } else {
        setSummary("No activity logged today.");
      }
      setLoading(false);
    });

    // Fetch class updates
    let unsubscribeUpdates = () => { };
    if (selectedChild.class_id) {
      const qUpdates = query(
        collection(db, 'class_updates'),
        where('class_id', '==', selectedChild.class_id),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      unsubscribeUpdates = onSnapshot(qUpdates, (snapshot) => {
        const updates = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate()
        })).reverse();
        setClassUpdates(updates);
        
        // Filter messages for this parent and child
        const relevantMessages = updates.filter((msg: any) => 
          msg.parent_id === user.uid || 
          (!msg.parent_id && msg.class_id === selectedChild.class_id)
        );
        setTeacherMessages(relevantMessages);
      });
    }

    return () => {
      unsubscribeLogs();
      unsubscribeUpdates();
    };
  }, [selectedChild]);

  if (loading && children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-12 h-12 text-[#4A90E2] animate-spin mb-4" />
        <p className="text-[#7F8C8D] font-bold animate-pulse">Finding your children...</p>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-[40px] border-2 border-dashed border-[#D1D9E6]">
        <Heart className="w-16 h-16 text-[#D1D9E6] mx-auto mb-4" />
        <h3 className="text-2xl font-black text-[#2C3E50] mb-2">No child linked yet</h3>
        <p className="text-[#7F8C8D] font-medium max-w-xs mx-auto">
          Please ask your child's teacher to link your account to their profile.
        </p>
      </div>
    );
  }

  if (!selectedChild) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h2 className="text-4xl font-black text-[#2C3E50] mb-2">My Children</h2>
          <p className="text-[#7F8C8D] font-medium">Select a child to see their day</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {children.map((child) => (
            <button
              key={child.uid}
              onClick={() => setSelectedChild(child)}
              className="flex items-center p-8 bg-white rounded-[40px] border-4 border-[#E5E5E5] shadow-lg hover:border-[#4A90E2] hover:shadow-xl transition-all group text-left"
            >
              <div className="w-20 h-20 bg-[#F0F4F8] rounded-3xl flex items-center justify-center text-4xl shadow-inner border-2 border-white mr-6 group-hover:scale-105 transition-transform">
                🧒
              </div>
              <div>
                <h3 className="text-2xl font-black text-[#2C3E50] tracking-tighter">{child.name}</h3>
                <p className="text-[#7F8C8D] font-bold uppercase tracking-widest text-xs mt-1">Student</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[40px] border-2 border-[#E5E5E5] shadow-sm">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setSelectedChild(null)}
            className="p-4 bg-[#F0F4F8] rounded-full hover:bg-[#E5E5E5] transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-[#2C3E50]" />
          </button>
          <div className="w-20 h-20 bg-[#F0F4F8] rounded-3xl flex items-center justify-center text-4xl shadow-inner border-2 border-white">
            🧒
          </div>
          <div>
            <h2 className="text-4xl font-black text-[#2C3E50] tracking-tighter">{selectedChild.name}'s Day</h2>
            <div className="flex items-center gap-2 text-[#7F8C8D] font-bold uppercase tracking-widest text-sm">
              <Calendar className="w-4 h-4" />
              {format(new Date(), 'EEEE, MMM d, yyyy')}
            </div>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center justify-center gap-2 bg-[#4A90E2] text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-[#357ABD] transition-all active:scale-95"
        >
          <Download className="w-5 h-5" />
          EXPORT LOGS
        </button>
      </div>

      {/* Daily Summary */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#EBF4FF] p-8 rounded-[40px] border-2 border-[#4A90E2] shadow-md relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#4A90E2] opacity-5 rounded-bl-full" />
          <div className="flex items-center gap-3 mb-4">
            <MessageSquare className="w-6 h-6 text-[#4A90E2]" />
            <h3 className="text-2xl font-black text-[#4A90E2] uppercase tracking-tighter">Daily Summary</h3>
          </div>
          <p className="text-xl text-[#2C3E50] font-medium leading-relaxed italic">
            "{summary}"
          </p>
        </motion.div>
      )}

      {/* Teacher Chat */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[40px] border-2 border-[#E5E5E5] shadow-lg overflow-hidden"
      >
        <div className="bg-gradient-to-r from-[#4A90E2] to-[#3B82F6] p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-6 h-6" />
              <h3 className="text-2xl font-black uppercase tracking-tighter">Chat with Teacher</h3>
            </div>
            <div className="text-sm font-bold opacity-90">
              {selectedChild.name}'s Teacher
            </div>
          </div>
        </div>

        <div className="h-96 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {teacherMessages.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-[#10B981]" />
                </div>
                <p className="text-[#64748B] font-bold text-lg">No messages yet</p>
                <p className="text-sm text-[#94A3B8] mt-2">Start a conversation with {selectedChild.name}'s teacher</p>
              </div>
            ) : (
              teacherMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.parent_id === user.uid ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 rounded-2xl font-medium ${
                    msg.parent_id === user.uid
                      ? 'bg-[#4A90E2] text-white rounded-br-none'
                      : 'bg-[#F8FAFC] text-[#1E293B] rounded-bl-none border border-[#E5E5E5]'
                  }`}>
                    {msg.parent_id === user.uid && (
                      <div className="text-xs opacity-75 mb-1">You</div>
                    )}
                    {!msg.parent_id && (
                      <div className="text-xs text-[#64748B] mb-1">Teacher</div>
                    )}
                    <p>{msg.message}</p>
                    <p className="text-xs opacity-75 mt-2">
                      {msg.timestamp ? format(msg.timestamp, 'h:mm a') : 'Just now'}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-[#E5E5E5]">
            <form onSubmit={handleSendMessage} className="flex gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 p-3 bg-[#F8FAFC] rounded-xl border border-[#E5E5E5] font-medium focus:border-[#4A90E2] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sendingMessage}
                className="bg-[#4A90E2] text-white p-3 rounded-xl font-bold shadow-md hover:bg-[#357ABD] disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {sendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </div>
      </motion.div>

      {/* Class Updates */}
      {classUpdates.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-4">
            <MessageSquare className="w-6 h-6 text-[#3B82F6]" />
            <h3 className="text-2xl font-black text-[#2C3E50] uppercase tracking-tighter">Class Updates</h3>
          </div>
          <div className="space-y-4">
            {classUpdates.map((update) => (
              <div key={update.id} className="bg-white p-6 rounded-[2.5rem] border-2 border-[#DBEAFE] shadow-sm">
                <p className="text-[#1E293B] font-medium leading-relaxed mb-3">{update.message}</p>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-[#3B82F6] uppercase tracking-widest">Teacher Update</p>
                  <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider">
                    {update.timestamp ? format(update.timestamp.toDate(), 'MMM d, h:mm a') : 'Just now'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-4">
          <FileText className="w-6 h-6 text-[#7F8C8D]" />
          <h3 className="text-2xl font-black text-[#2C3E50] uppercase tracking-tighter">Activity Log</h3>
        </div>

        <div className="space-y-4">
          {logs.map((log) => (
            <motion.div
              key={log.id}
              layout
              className="bg-white rounded-3xl border-2 border-[#F0F4F8] overflow-hidden shadow-sm hover:border-[#D1D9E6] transition-all"
            >
              <button
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id!)}
                className="w-full p-6 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{log.emotion.split(' ')[0]}</span>
                  <div>
                    <p className="font-black text-[#2C3E50] text-xl">{log.emotion.split(' ')[1]}</p>
                    <div className="flex items-center gap-2 text-sm text-[#7F8C8D] font-bold uppercase tracking-wider">
                      <Clock className="w-4 h-4" />
                      {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'h:mm a') : 'Just now'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {log.help_requested && !log.resolved && (
                    <span className="bg-[#FEE2E2] text-[#E74C3C] px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter">
                      Support Needed
                    </span>
                  )}
                  {expandedLog === log.id ? <ChevronUp className="w-6 h-6 text-[#D1D9E6]" /> : <ChevronDown className="w-6 h-6 text-[#D1D9E6]" />}
                </div>
              </button>

              <AnimatePresence>
                {expandedLog === log.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-6 pb-6 border-t border-[#F0F4F8]"
                  >
                    <div className="pt-6 flex flex-col md:flex-row gap-6">
                      <div className="w-full md:w-48 aspect-square rounded-2xl overflow-hidden bg-[#F0F4F8] border border-[#E5E5E5] flex-shrink-0">
                        <AIImage prompt={log.reason_prompt} className="w-full h-full" />
                      </div>
                      <div className="flex-1 space-y-4">
                        <div>
                          <p className="text-sm font-bold text-[#7F8C8D] uppercase tracking-widest mb-1">Reason</p>
                          <p className="text-xl text-[#2C3E50] font-medium italic">"{log.reason}"</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#7F8C8D] uppercase tracking-widest mb-2">Suggested Actions</p>
                          <div className="flex flex-wrap gap-2">
                            {log.ai_suggestions.map((s, i) => (
                              <span key={i} className="bg-[#E8F8F0] px-4 py-2 rounded-xl border border-[#D1E9FF] text-sm font-bold text-[#27AE60]">
                                {s.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
