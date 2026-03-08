import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, AlertCircle, CheckCircle2, Clock, ChevronRight, MessageSquare, FileText, Loader2, X, Bell, Menu, Plus, BarChart2, Settings, Home, ArrowLeft, ThumbsUp, Star, MoreHorizontal, Send, ChevronDown } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LineChart, Line } from 'recharts';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, getDocs, getDoc, addDoc, serverTimestamp, deleteDoc, setDoc } from 'firebase/firestore';
import { format, formatDistanceToNow } from 'date-fns';
import { UserProfile, EmotionLog } from '../types';
import { generateDailySummary } from '../services/geminiService';
import { AIImage } from './AIImage';

interface TeacherDashboardProps {
  user: UserProfile;
}

type TabType = 'all' | 'support' | 'checkin';
type ViewType = 'class' | 'messages' | 'reports' | 'settings';

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user }) => {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<EmotionLog[]>([]);
  const [classUpdates, setClassUpdates] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [view, setView] = useState<ViewType>('class');
  const [className, setClassName] = useState<string>('My Class');
  const [newMessage, setNewMessage] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [selectedReportStudent, setSelectedReportStudent] = useState<string | null>(null);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);

  useEffect(() => {
    // Close dropdowns when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (showMenuDropdown) {
        setShowMenuDropdown(false);
      }
      if (showStudentDropdown) {
        setShowStudentDropdown(false);
      }
    };

    if (showMenuDropdown || showStudentDropdown) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showMenuDropdown, showStudentDropdown]);

  useEffect(() => {
    // Fetch class name
    if (user.class_id) {
      getDoc(doc(db, 'classes', user.class_id)).then(docSnap => {
        if (docSnap.exists()) {
          setClassName(docSnap.data().name);
        }
      });
    }

    const qStudents = query(collection(db, 'users'), where('role', '==', 'student'));
    const unsubscribeStudents = onSnapshot(qStudents, (snapshot) => {
      const studentList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setStudents(studentList);
    });

    const qLogs = query(collection(db, 'emotion_logs'), orderBy('timestamp', 'desc'));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const logList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmotionLog));
      setLogs(logList);
    });

    const qUpdates = query(collection(db, 'class_updates'), where('class_id', '==', user.class_id), orderBy('timestamp', 'desc'));
    const unsubscribeUpdates = onSnapshot(qUpdates, (snapshot) => {
      const updateList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClassUpdates(updateList);
    });

    return () => {
      unsubscribeStudents();
      unsubscribeLogs();
      unsubscribeUpdates();
    };
  }, [user.class_id]);

  const unresolvedLogs = logs.filter(l => l.help_requested && !l.resolved);
  const alertsCount = unresolvedLogs.length;
  const onTrackCount = students.length - alertsCount;

  const filteredStudents = students.filter(student => {
    if (activeTab === 'all') return true;
    const lastLog = logs.find(l => l.student_id === student.uid);
    if (activeTab === 'support') return lastLog?.help_requested && !lastLog?.resolved;
    if (activeTab === 'checkin') return lastLog && !lastLog.resolved;
    return true;
  }).sort((a, b) => {
    const aLog = logs.find(l => l.student_id === a.uid);
    const bLog = logs.find(l => l.student_id === b.uid);
    const aAlert = aLog?.help_requested && !aLog?.resolved;
    const bAlert = bLog?.help_requested && !bLog?.resolved;
    if (aAlert && !bAlert) return -1;
    if (!aAlert && bAlert) return 1;
    return 0;
  });

  const handleResolve = async (logId: string) => {
    await updateDoc(doc(db, 'emotion_logs', logId), {
      resolved: true,
      help_requested: false,
      resolvedAt: new Date().toISOString()
    });
  };

  const handleGenerateSummary = async (student: UserProfile) => {
    setLoadingSummary(true);
    try {
      const studentLogs = logs.filter(l => l.student_id === student.uid);
      const text = await generateDailySummary(student.name, studentLogs);
      setSummary(text);
    } catch (error) {
      console.error('Error generating summary:', error);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user.class_id) return;

    setSendingMessage(true);
    try {
      await addDoc(collection(db, 'class_updates'), {
        teacher_id: user.uid,
        class_id: user.class_id,
        message: newMessage.trim(),
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !user.class_id) return;

    setAddingStudent(true);
    try {
      const newUid = `student_${Date.now()}`;
      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        name: newStudentName.trim(),
        role: 'student',
        class_id: user.class_id,
        email: `${newStudentName.toLowerCase().replace(/\s/g, '')}@example.com`,
        createdAt: new Date().toISOString()
      });
      setNewStudentName('');
    } catch (error) {
      console.error('Error adding student:', error);
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to remove this student?')) return;
    try {
      await updateDoc(doc(db, 'users', studentId), {
        class_id: null
      });
    } catch (error) {
      console.error('Error removing student:', error);
    }
  };

  const renderBottomNav = () => (
    <div className="px-6 pb-10 bg-white pt-6 border-t border-[#F1F5F9]">
      <div className="flex justify-between items-center px-4">
        <button
          onClick={() => setView('class')}
          className={`flex flex-col items-center gap-1 ${view === 'class' ? 'text-[#3B82F6]' : 'text-[#94A3B8]'}`}
        >
          <Users className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-wider">Class</span>
        </button>
        <button
          onClick={() => setView('messages')}
          className={`flex flex-col items-center gap-1 ${view === 'messages' ? 'text-[#3B82F6]' : 'text-[#94A3B8]'}`}
        >
          <MessageSquare className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-wider">Messages</span>
        </button>
        <button
          onClick={() => setView('reports')}
          className={`flex flex-col items-center gap-1 ${view === 'reports' ? 'text-[#3B82F6]' : 'text-[#94A3B8]'}`}
        >
          <BarChart2 className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-wider">Reports</span>
        </button>
        <button
          onClick={() => setView('settings')}
          className={`flex flex-col items-center gap-1 ${view === 'settings' ? 'text-[#3B82F6]' : 'text-[#94A3B8]'}`}
        >
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-wider">Settings</span>
        </button>
      </div>
    </div>
  );

  const renderMessages = () => (
    <div className="flex flex-col h-full max-w-4xl mx-auto bg-[#F8FAFC] shadow-2xl rounded-[3rem] overflow-hidden border-8 border-white">
      <div className="px-8 pt-10 pb-6 bg-white border-b border-[#F1F5F9]">
        <h2 className="text-3xl font-black text-[#1E293B] tracking-tight">Parent Updates</h2>
        <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest">Share news with class parents</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
        <form onSubmit={handleSendMessage} className="space-y-4">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="What's happening in class today?"
            className="w-full p-5 bg-white rounded-[2rem] border-2 border-[#F1F5F9] focus:border-[#3B82F6] outline-none transition-all shadow-sm min-h-[120px] font-medium"
          />
          <button
            type="submit"
            disabled={sendingMessage || !newMessage.trim()}
            className="w-full bg-[#3B82F6] text-white p-5 rounded-[2rem] font-black uppercase tracking-widest shadow-lg shadow-[#3B82F6]/20 hover:bg-[#2563EB] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sendingMessage ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
            Post Update
          </button>
        </form>

        <div className="space-y-4">
          <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] px-2">Recent Updates</h3>
          {classUpdates.map((update) => (
            <div key={update.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-[#F1F5F9] space-y-2">
              <p className="text-[#1E293B] font-medium leading-relaxed">{update.message}</p>
              <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider">
                {update.timestamp ? formatDistanceToNow(update.timestamp.toDate()) + ' ago' : 'Just now'}
              </p>
            </div>
          ))}
          {classUpdates.length === 0 && (
            <div className="text-center py-10">
              <p className="text-[#94A3B8] font-bold">No updates shared yet.</p>
            </div>
          )}
        </div>
      </div>
      {renderBottomNav()}
    </div>
  );

  const renderReports = () => {
    const filteredLogs = selectedReportStudent 
      ? logs.filter(log => log.student_id === selectedReportStudent)
      : logs;

    const emotionCounts = filteredLogs.reduce((acc: any, log) => {
      const emotion = log.emotion.split(' ')[1];
      acc[emotion] = (acc[emotion] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.keys(emotionCounts).map(key => ({
      name: key,
      count: emotionCounts[key]
    }));

    // Create time-series data for individual student
    const timeSeriesData = selectedReportStudent 
      ? filteredLogs
          .sort((a, b) => new Date(a.timestamp?.toDate() || 0).getTime() - new Date(b.timestamp?.toDate() || 0).getTime())
          .map((log, index) => ({
            time: format(log.timestamp?.toDate() || new Date(), 'MMM dd'),
            emotion: log.emotion.split(' ')[1],
            fullEmotion: log.emotion,
            reason: log.reason,
            index: index + 1
          }))
      : [];

    const COLORS = ['#10B981', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899'];

    return (
      <div className="flex flex-col h-full max-w-4xl mx-auto bg-[#F8FAFC] shadow-2xl rounded-[3rem] overflow-hidden border-8 border-white">
        <div className="px-8 pt-10 pb-6 bg-white border-b border-[#F1F5F9]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-3xl font-black text-[#1E293B] tracking-tight">
                {selectedReportStudent ? 'Individual Insights' : 'Class Insights'}
              </h2>
              <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest">
                {selectedReportStudent ? 'Student emotion tracking over time' : 'Emotion distribution summary'}
              </p>
            </div>
            
            {/* Student Filter Dropdown */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStudentDropdown(!showStudentDropdown);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#F1F5F9] rounded-xl hover:bg-[#E2E8F0] transition-colors"
              >
                <Users className="w-4 h-4" />
                <span className="text-sm font-bold">
                  {selectedReportStudent 
                    ? students.find(s => s.uid === selectedReportStudent)?.name || 'Unknown'
                    : 'All Students'
                  }
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showStudentDropdown ? 'rotate-180' : ''}`} />
                {selectedReportStudent && (
                  <X 
                    className="w-4 h-4 text-[#EF4444]" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedReportStudent(null);
                    }}
                  />
                )}
              </button>
              
              {showStudentDropdown && (
                <div className="absolute top-12 right-0 bg-white rounded-xl shadow-lg border border-[#F1F5F9] w-48 z-10">
                  <div className="p-2 max-h-64 overflow-y-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReportStudent(null);
                        setShowStudentDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F8FAFC] text-sm font-bold flex items-center gap-2"
                    >
                      <Users className="w-4 h-4" />
                      All Students
                    </button>
                    {students.map((student) => (
                      <button
                        key={student.uid}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReportStudent(student.uid);
                          setShowStudentDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F8FAFC] text-sm flex items-center gap-2"
                      >
                        <div className="w-6 h-6 bg-[#F1F5F9] rounded-full flex items-center justify-center text-xs">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        {student.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8">
          {selectedReportStudent && timeSeriesData.length > 0 ? (
            <>
              {/* Individual Student Timeline Chart */}
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-[#F1F5F9]">
                <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] mb-6 text-center">
                  Emotion Timeline - {students.find(s => s.uid === selectedReportStudent)?.name}
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeSeriesData}>
                      <XAxis 
                        dataKey="time" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 'bold' }} 
                      />
                      <YAxis hide />
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload[0]) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-3 rounded-xl shadow-lg border border-[#F1F5F9]">
                                <p className="font-bold text-sm">{data.fullEmotion}</p>
                                <p className="text-xs text-[#64748B]">{data.time}</p>
                                {data.reason && (
                                  <p className="text-xs text-[#94A3B8] mt-1 italic">"{data.reason}"</p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="index" 
                        stroke="#3B82F6" 
                        strokeWidth={3}
                        dot={{ fill: '#3B82F6', r: 6 }}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Individual Emotion Distribution */}
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-[#F1F5F9]">
                <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] mb-6 text-center">
                  Emotion Distribution
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                      <YAxis hide />
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent Emotion Logs */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] px-2">Recent Emotion Logs</h3>
                {timeSeriesData.slice(-5).reverse().map((log, index) => (
                  <div key={index} className="bg-white p-4 rounded-[2rem] shadow-sm border border-[#F1F5F9] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{log.fullEmotion.split(' ')[0]}</span>
                      <div>
                        <p className="font-black text-[#1E293B]">{log.emotion}</p>
                        <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider">{log.time}</p>
                      </div>
                    </div>
                    {log.reason && (
                      <p className="text-sm text-[#64748B] italic max-w-xs truncate">"{log.reason}"</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Class-wide Emotion Distribution */}
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-[#F1F5F9]">
                <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] mb-6 text-center">Emotion Distribution</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                      <YAxis hide />
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {chartData.map((data, idx) => (
                  <div key={data.name} className="bg-white p-5 rounded-[2rem] border border-[#F1F5F9] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-xs font-black text-[#1E293B] uppercase tracking-wider">{data.name}</span>
                    </div>
                    <span className="text-lg font-black text-[#1E293B]">{data.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        {renderBottomNav()}
      </div>
    );
  };

  const renderSettings = () => (
    <div className="flex flex-col h-full max-w-4xl mx-auto bg-[#F8FAFC] shadow-2xl rounded-[3rem] overflow-hidden border-8 border-white">
      <div className="px-8 pt-10 pb-6 bg-white border-b border-[#F1F5F9]">
        <h2 className="text-3xl font-black text-[#1E293B] tracking-tight">Settings</h2>
        <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest">Manage your class roster</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8">
        <div className="space-y-4">
          <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] px-2">Add New Student</h3>
          <form onSubmit={handleAddStudent} className="flex gap-2">
            <input
              type="text"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Student Name"
              className="flex-1 p-4 bg-white rounded-2xl border-2 border-[#F1F5F9] focus:border-[#3B82F6] outline-none transition-all shadow-sm font-bold"
            />
            <button
              type="submit"
              disabled={addingStudent || !newStudentName.trim()}
              className="bg-[#3B82F6] text-white p-4 rounded-2xl font-black shadow-lg shadow-[#3B82F6]/20 hover:bg-[#2563EB] transition-all disabled:opacity-50"
            >
              {addingStudent ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] px-2">Class Roster ({students.length})</h3>
          <div className="space-y-3">
            {students.map((student) => (
              <div key={student.uid} className="bg-white p-5 rounded-[2rem] shadow-sm border border-[#F1F5F9] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#F1F5F9] rounded-2xl flex items-center justify-center text-xl">
                    👤
                  </div>
                  <span className="font-black text-[#1E293B]">{student.name}</span>
                </div>
                <button
                  onClick={() => handleRemoveStudent(student.uid)}
                  className="p-3 bg-[#FEE2E2] text-[#EF4444] rounded-xl hover:bg-[#EF4444] hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {renderBottomNav()}
    </div>
  );

  const renderDetail = (student: UserProfile) => {
    const lastLog = logs.find(l => l.student_id === student.uid);
    const emotionColor = lastLog?.emotion.includes('HAPPY') ? 'bg-[#10B981]' : lastLog?.emotion.includes('ANGRY') ? 'bg-[#EF4444]' : 'bg-[#3B82F6]';

    return (
      <div className="flex flex-col h-full max-w-4xl mx-auto bg-[#F8FAFC] shadow-2xl rounded-[3rem] overflow-hidden border-8 border-white relative">
        {/* Header */}
        <div className="px-8 pt-10 pb-6 flex justify-between items-center">
          <button onClick={() => setSelectedStudent(null)} className="p-4 bg-white rounded-full shadow-sm text-[#1E293B]">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="bg-white px-6 py-2 rounded-full shadow-sm">
            <span className="text-sm font-black text-[#1E293B]">{format(new Date(), 'h:mm a')}</span>
          </div>
          <button className="p-4 bg-white rounded-full shadow-sm text-[#1E293B]">
            <Users className="w-6 h-6" />
          </button>
        </div>

        {/* Student Info */}
        <div className="text-center px-8 mb-6">
          <h2 className="text-5xl font-black text-[#1E293B] tracking-tighter mb-2">{student.name}</h2>
          <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest">St. Mary's Primary School</p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8 space-y-8 pb-10">
          {/* Main Status Card */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`w-full aspect-square ${emotionColor} rounded-[3rem] flex flex-col items-center justify-center text-white shadow-xl shadow-black/5 p-10 text-center`}
          >
            <div className="text-[8rem] mb-6 drop-shadow-lg">
              {lastLog?.emotion.split(' ')[0] || '👤'}
            </div>
            <h3 className="text-4xl font-black tracking-tight">I feel {lastLog?.emotion.split(' ')[1].toLowerCase() || 'neutral'}</h3>
            {lastLog?.reason && (
              <p className="mt-4 text-white/80 font-medium italic">"{lastLog.reason}"</p>
            )}
          </motion.div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-6">
            <button
              onClick={() => lastLog && handleResolve(lastLog.id!)}
              className="bg-[#EFF6FF] border-4 border-[#3B82F6] rounded-[2.5rem] p-8 flex flex-col items-center gap-3 group hover:bg-[#3B82F6] transition-all"
            >
              <ThumbsUp className="w-10 h-10 text-[#3B82F6] group-hover:text-white" />
              <span className="text-xl font-black text-[#3B82F6] group-hover:text-white uppercase tracking-tighter">Resolve</span>
            </button>
            <button className="bg-[#FEE2E2] border-4 border-[#EF4444] rounded-[2.5rem] p-8 flex flex-col items-center gap-3 group hover:bg-[#EF4444] transition-all">
              <Star className="w-10 h-10 text-[#EF4444] group-hover:text-white" />
              <span className="text-xl font-black text-[#EF4444] group-hover:text-white uppercase tracking-tighter">Support</span>
            </button>
          </div>

          {/* Activity Log */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] px-2">Activity Log</h3>
            {logs.filter(l => l.student_id === student.uid).map((log) => (
              <div key={log.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-[#F1F5F9] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{log.emotion.split(' ')[0]}</span>
                  <div>
                    <p className="font-black text-[#1E293B]">{log.emotion.split(' ')[1]}</p>
                    <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider">
                      {log.timestamp ? formatDistanceToNow(log.timestamp.toDate()) + ' ago' : 'Just now'}
                    </p>
                  </div>
                </div>
                {log.help_requested && !log.resolved && (
                  <span className="w-3 h-3 bg-[#EF4444] rounded-full" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Nav */}
        <div className="px-10 pb-10 flex justify-between items-center text-[#94A3B8]">
          <button className="flex flex-col items-center gap-1 text-[#3B82F6]">
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-wider">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <MessageSquare className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-wider">Messages</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <Clock className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-wider">History</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <Settings className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-wider">Settings</span>
          </button>
        </div>
      </div>
    );
  };

  const renderMenuDropdown = () => {
    const teacherTools = [
      {
        title: 'Classroom Management',
        description: 'Tips for managing your classroom effectively',
        icon: <Users className="w-5 h-5" />,
        link: 'https://www.edutopia.org/classroom-management',
        color: 'text-[#3B82F6]'
      },
      {
        title: 'Student Engagement',
        description: 'Strategies to keep students engaged and motivated',
        icon: <Star className="w-5 h-5" />,
        link: 'https://teachingcommons.stanford.edu/teaching-guides/foundations-course-design/learning-activities/increasing-student-engagement',
        color: 'text-[#10B981]'
      },
      {
        title: 'Special Education Resources',
        description: 'Resources for teaching students with special needs',
        icon: <AlertCircle className="w-5 h-5" />,
        link: 'https://www.understood.org/en',
        color: 'text-[#F59E0B]'
      },
      {
        title: 'Communication Tips',
        description: 'Better communication with parents and students',
        icon: <MessageSquare className="w-5 h-5" />,
        link: 'https://www.readingrockets.org/topics/parent-engagement/articles/building-parent-teacher-relationships',
        color: 'text-[#8B5CF6]'
      },
      {
        title: 'Emotional Support',
        description: 'Helping students manage emotions and stress',
        icon: <ThumbsUp className="w-5 h-5" />,
        link: 'https://www.casel.org/',
        color: 'text-[#EC4899]'
      },
      {
        title: 'Teaching Resources',
        description: 'Lesson plans and teaching materials',
        icon: <FileText className="w-5 h-5" />,
        link: 'https://www.teacherspayteachers.com/',
        color: 'text-[#EF4444]'
      }
    ];

    return (
      <div className="absolute top-16 left-4 bg-white rounded-2xl shadow-2xl border border-[#F1F5F9] w-80 z-50 overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white">
          <h3 className="font-black text-lg">Teacher Resources</h3>
          <p className="text-sm opacity-90">Helpful tools and links</p>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {teacherTools.map((tool, index) => (
            <a
              key={index}
              href={tool.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-4 hover:bg-[#F8FAFC] transition-colors border-b border-[#F1F5F9] last:border-b-0"
            >
              <div className={`p-2 rounded-xl bg-[#F1F5F9] ${tool.color}`}>
                {tool.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-black text-sm text-[#1E293B]">{tool.title}</h4>
                <p className="text-xs text-[#64748B] mt-1 line-clamp-2">{tool.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#CBD5E1] mt-1 flex-shrink-0" />
            </a>
          ))}
        </div>
        
        <div className="p-3 bg-[#F8FAFC] border-t border-[#F1F5F9]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenuDropdown(false);
            }}
            className="w-full text-center text-xs font-bold text-[#64748B] hover:text-[#1E293B] transition-colors"
          >
            Close Menu
          </button>
        </div>
      </div>
    );
  };

  const renderNotifications = () => {
    const helpLogs = logs.filter(l => l.help_requested).sort((a, b) => 
      new Date(b.timestamp?.toDate() || 0).getTime() - new Date(a.timestamp?.toDate() || 0).getTime()
    );

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-[3rem] w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
        >
          <div className="px-8 pt-8 pb-6 bg-white border-b border-[#F1F5F9] flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-black text-[#1E293B] tracking-tight">Help Notifications</h2>
              <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest">
                {helpLogs.length} {helpLogs.length === 1 ? 'request' : 'requests'} for assistance
              </p>
            </div>
            <button
              onClick={() => setShowNotifications(false)}
              className="p-3 bg-[#F1F5F9] rounded-2xl text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 max-h-[60vh]">
            {helpLogs.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-[#F0FDF4] rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-[#10B981]" />
                </div>
                <p className="text-[#64748B] font-bold">No help requests yet</p>
                <p className="text-sm text-[#94A3B8] mt-2">Students' help requests will appear here</p>
              </div>
            ) : (
              helpLogs.map((log) => {
                const student = students.find(s => s.uid === log.student_id);
                const isResolved = log.resolved;
                
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-6 rounded-[2rem] border-2 transition-all ${
                      isResolved 
                        ? 'bg-[#F0FDF4] border-[#DCFCE7]' 
                        : 'bg-[#FEF2F2] border-[#FECACA]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${
                          isResolved ? 'bg-[#DCFCE7]' : 'bg-[#FECACA]'
                        }`}>
                          {log.emotion.split(' ')[0]}
                        </div>
                        <div>
                          <p className="font-black text-[#1E293B] text-lg">
                            {student?.name || 'Unknown Student'}
                          </p>
                          <p className={`text-sm font-bold ${
                            isResolved ? 'text-[#10B981]' : 'text-[#EF4444]'
                          }`}>
                            {isResolved ? 'Resolved' : 'Needs Help'} • {log.emotion.split(' ')[1]}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider">
                          {log.timestamp ? formatDistanceToNow(log.timestamp.toDate()) + ' ago' : 'Just now'}
                        </p>
                        {isResolved && log.resolvedAt && (
                          <p className="text-[10px] text-[#10B981] font-bold uppercase tracking-wider mt-1">
                            Resolved {formatDistanceToNow(new Date(log.resolvedAt))} ago
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {log.reason && (
                      <p className="text-[#1E293B] font-medium mb-4 italic">
                        "{log.reason}"
                      </p>
                    )}
                    
                    <div className="flex gap-3">
                      {!isResolved && (
                        <button
                          onClick={() => handleResolve(log.id!)}
                          className="flex-1 bg-[#10B981] text-white p-3 rounded-xl font-black text-sm hover:bg-[#059669] transition-colors flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark as Resolved
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedStudent(student);
                          setShowNotifications(false);
                        }}
                        className="flex-1 bg-[#F1F5F9] text-[#1E293B] p-3 rounded-xl font-black text-sm hover:bg-[#E2E8F0] transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="flex flex-col h-full max-w-4xl mx-auto bg-[#F8FAFC] shadow-2xl rounded-[3rem] overflow-hidden border-8 border-white">
      {/* Header */}
      <div className="px-8 pt-10 pb-6 bg-white relative">
        <div className="flex justify-between items-center mb-8">
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowMenuDropdown(!showMenuDropdown);
              }}
              className="p-3 bg-[#F1F5F9] rounded-2xl text-[#64748B] hover:bg-[#E2E8F0] transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            {showMenuDropdown && renderMenuDropdown()}
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black text-[#1E293B] tracking-tight">{className}</h2>
            <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest">Class</p>
          </div>
          <button 
            onClick={() => setShowNotifications(true)}
            className="p-3 bg-[#F1F5F9] rounded-2xl text-[#64748B] relative hover:bg-[#E2E8F0] transition-colors"
          >
            <Bell className="w-6 h-6" />
            {alertsCount > 0 && <span className="absolute top-2 right-2 w-3 h-3 bg-[#EF4444] rounded-full border-2 border-white" />}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-[#F1F5F9] rounded-2xl">
          {(['all', 'support', 'checkin'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-white text-[#3B82F6] shadow-sm' : 'text-[#94A3B8]'
                }`}
            >
              {tab === 'all' ? `All Students (${students.length})` : tab === 'support' ? 'Needs Support' : 'Daily Check-in'}
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Activity */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-4">
        <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-[0.2em] mb-4 px-2">Real-time Activity</h3>
        {filteredStudents.map((student) => {
          const lastLog = logs.find(l => l.student_id === student.uid);
          const isAlert = lastLog?.help_requested && !lastLog?.resolved;

          return (
            <motion.button
              key={student.uid}
              layoutId={student.uid}
              onClick={() => setSelectedStudent(student)}
              className="w-full flex items-center p-5 bg-white rounded-[2.5rem] border-2 border-transparent hover:border-[#3B82F6]/20 transition-all shadow-sm group"
            >
              <div className="relative mr-5">
                <div className="w-16 h-16 bg-[#F1F5F9] rounded-3xl flex items-center justify-center text-3xl shadow-inner group-hover:scale-105 transition-transform">
                  {lastLog?.emotion.split(' ')[0] || '👤'}
                </div>
                {isAlert && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#EF4444] rounded-full border-4 border-white flex items-center justify-center">
                    <span className="text-[10px] text-white">✋</span>
                  </div>
                )}
                {!isAlert && lastLog && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#10B981] rounded-full border-4 border-white flex items-center justify-center">
                    <span className="text-[10px] text-white">😊</span>
                  </div>
                )}
              </div>
              <div className="text-left flex-1">
                <p className="text-lg font-black text-[#1E293B] tracking-tight">{student.name}</p>
                <p className={`text-sm font-bold ${isAlert ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>
                  {isAlert ? `Needs help - ${lastLog.reason}` : lastLog ? `Feeling ${lastLog.emotion.split(' ')[1]} & engaged` : 'No activity yet'}
                </p>
                <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider mt-1">
                  {lastLog?.timestamp ? `Updated ${formatDistanceToNow(lastLog.timestamp.toDate())} ago` : 'Waiting for check-in'}
                </p>
              </div>
              <div className="p-3 bg-[#F8FAFC] rounded-2xl text-[#CBD5E1]">
                {isAlert ? <MessageSquare className="w-5 h-5 text-[#EF4444]" /> : <MoreHorizontal className="w-5 h-5" />}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Stats & Bottom Nav */}
      <div className="px-6 pb-10 bg-white pt-6 border-t border-[#F1F5F9]">
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-[#EFF6FF] p-6 rounded-[2.5rem] border-2 border-[#DBEAFE]">
            <p className="text-[10px] font-black text-[#3B82F6] uppercase tracking-widest mb-1">Alerts</p>
            <p className="text-4xl font-black text-[#3B82F6]">{alertsCount}</p>
          </div>
          <div className="bg-[#F0FDF4] p-6 rounded-[2.5rem] border-2 border-[#DCFCE7]">
            <p className="text-[10px] font-black text-[#10B981] uppercase tracking-widest mb-1">On Track</p>
            <p className="text-4xl font-black text-[#10B981]">{onTrackCount}</p>
          </div>
        </div>
        {renderBottomNav()}
      </div>
    </div>
  );

  const renderContent = () => {
    if (selectedStudent) return renderDetail(selectedStudent);

    switch (view) {
      case 'messages': return renderMessages();
      case 'reports': return renderReports();
      case 'settings': return renderSettings();
      default: return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] py-12 px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedStudent ? 'detail' : view}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          className="h-full"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
      
      {showNotifications && renderNotifications()}
    </div>
  );
};
