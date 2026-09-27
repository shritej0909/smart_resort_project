import { motion } from 'framer-motion';
import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, User, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  mode?: string;
  sources?: { id: string; title: string }[];
  nugen?: {
    used?: boolean;
    model?: string;
    intent?: string;
    confidence?: number;
    priority?: string;
    category?: string;
  };
  timestamp: Date;
  error?: boolean;
};

const SUGGESTED = [
  'What time does the spa open?',
  'Can I get late checkout?',
  'What activities are available?',
  'Tell me about the pool hours',
  'How do I order room service?',
];

function AIConcierge() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hello! I\'m your AI concierge at Smart Resort 360. I can help with spa bookings, dining, pool hours, activities, and anything about your stay. How can I help?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    setInput('');

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text: question, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await api<{
        answer: string;
        sources: { id: string; title: string }[];
        mode: string;
        model: string | null;
        nugen?: {
          used?: boolean;
          model?: string;
          intent?: string;
          confidence?: number;
          priority?: string;
          category?: string;
        };
      }>(
        '/concierge/chat', 'POST', { message: question }
      );
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: result.answer,
        mode: result.mode,
        sources: result.sources,
        nugen: result.nugen,
        timestamp: new Date(),
      }]);

    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: e.message || 'Something went wrong. Please try again.',
        timestamp: new Date(),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function fmt(d: Date) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <motion.div className="h-[calc(100vh-180px)] flex flex-col gap-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      {/* Header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-4 text-white">
        <div className="p-2 bg-white/20 rounded-xl">
          <Bot className="w-6 h-6" />
        </div>
        <div>
          <div className="font-bold text-lg">AI Concierge</div>
          <div className="text-purple-100 text-sm flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full inline-block"></span>
            Powered by RAG · Answers from your hotel guide
          </div>
        </div>
        <div className="ml-auto">
          <Sparkles className="w-5 h-5 text-white/60" />
        </div>
      </div>

      {/* Chat window */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-2 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${
                  msg.role === 'assistant' ? 'bg-gradient-to-br from-purple-500 to-pink-600' : 'bg-gradient-to-br from-blue-500 to-cyan-600'
                }`}>
                  {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>

                <div>
                  <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white'
                      : msg.error
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-slate-100 text-slate-900'
                  }`}>
                    {msg.error && <AlertCircle className="w-4 h-4 inline mr-1 mb-0.5" />}
                    {msg.text}
                  </div>

                  <div className={`flex items-center gap-2 mt-1 text-xs text-slate-400 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    <Clock className="w-3 h-3" />
                    {fmt(msg.timestamp)}
                    {msg.mode && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        msg.mode === 'rag-llm' ? 'bg-purple-100 text-purple-600' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {msg.mode === 'rag-llm' ? 'AI' : 'KB'}
                      </span>
                    )}
                    {msg.nugen?.used && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200/60 inline-flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                        AI Intelligence: Nugen Hospitality Model{msg.nugen.confidence ? ` (${Math.round(msg.nugen.confidence)}%)` : ''}
                      </span>
                    )}
                  </div>

                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-slate-100 rounded-2xl px-4 py-3 flex items-center gap-2 text-slate-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finding the best answer…
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggested questions (show only at start) */}
        {messages.length <= 2 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200 hover:bg-purple-100 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-slate-200">
          <form
            onSubmit={e => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything about your stay…"
              disabled={loading}
              className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>
    </motion.div>
  );
}

export default AIConcierge;
